import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createTrelloCard, getTrelloCardUrl, TRELLO_LISTS } from "@/lib/trello";
import { renderTrelloCardDescription } from "@/lib/trello-card-template";

async function getActorOrReject(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  return { ok: true as const, user, profile: profile || null };
}

async function fetchTrelloListName(listId: string): Promise<string | null> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!apiKey || !token) return null;

  try {
    const response = await fetch(`https://api.trello.com/1/lists/${listId}?fields=name&key=${apiKey}&token=${token}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = await response.json();
    if (!json || typeof json.name !== "string") return null;
    return json.name;
  } catch {
    return null;
  }
}

type LeadRow = {
  id: string;
  lead_id: string;
  customer_name: string | null;
  name: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  location?: string | null;
  sales_status: string | null;
  status: string | null;
  payment_status: string | null;
  delivery_date: string | null;
  design_notes: string | null;
  trello_card_id: string | null;
  production_stage?: string | null;
};

type JobSummary = {
  id: string;
  trello_card_id: string | null;
  trello_card_url: string | null;
  trello_list_id: string | null;
  production_stage: string | null;
};

async function findExistingJobByLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: LeadRow
): Promise<JobSummary | null> {
  const baseSelect = "id, trello_card_id, trello_card_url, trello_list_id, production_stage";
  const { data: byText, error: byTextError } = await supabase.from("jobs").select(baseSelect).eq("lead_id", lead.lead_id).maybeSingle();
  if (!byTextError && byText) return byText as unknown as JobSummary;

  const { data: byUuid, error: byUuidError } = await supabase.from("jobs").select(baseSelect).eq("lead_id", lead.id).maybeSingle();
  if (!byUuidError && byUuid) return byUuid as unknown as JobSummary;

  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatCardTitle(lead: LeadRow): string {
  const leadId = lead.lead_id;
  const customerName = (lead.customer_name || lead.name || "").trim();
  const org = (lead.organization || "").trim();
  if (customerName && org) return `${customerName} — ${org} (${leadId})`;
  if (customerName) return `${customerName} (${leadId})`;
  return `Lead ${leadId}`;
}

function buildDescription(params: {
  lead: LeadRow;
  jobId: string;
  productList: string;
  paymentStatus: string;
}): string {
  const leadId = params.lead.lead_id;
  const customerName = (params.lead.customer_name || params.lead.name || "").trim() || `Lead ${leadId}`;
  const productList = params.productList.trim() || "Product Name (STD)\n[Qty], [Size]";

  return renderTrelloCardDescription({
    INVOICE_NUMBER: "[Enter Invoice # Here]",
    PAYMENT_STATUS: params.paymentStatus || "Pending",
    JOB_ID: params.jobId,
    ORDER_QUANTITY: "[Enter Total Quantity]",
    ORDER_DEADLINE: params.lead.delivery_date || "[Enter Deadline]",
    PRODUCT_LIST: productList,
    CUSTOMER_NAME: customerName,
    PHONE: params.lead.phone || "[Enter Phone]",
    EMAIL: params.lead.email || "[Enter Email]",
    ORGANIZATION: params.lead.organization || "[Enter Organization]",
    LOCATION: params.lead.location || "[Enter Location]",
    DESIGN_NOTES: params.lead.design_notes || "[Add any final design notes here]",
    LEAD_ID: leadId,
    INVOICE_MACHINE: "",
    ORDER_QUANTITY_MACHINE: "",
    ORDER_DEADLINE_MACHINE: params.lead.delivery_date || "",
  });
}

async function createOrReturnExisting(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  actorUserId: string;
  leadId: string;
  jobId: string;
  cardTitle: string;
  targetListId: string;
  productList: string;
}) {
  const leadSelect =
    "id, lead_id, customer_name, name, organization, email, phone, location, sales_status, status, payment_status, delivery_date, design_notes, trello_card_id, production_stage";
  const leadQuery = isUuid(params.leadId)
    ? params.supabase.from("leads").select(leadSelect).eq("id", params.leadId).single()
    : params.supabase.from("leads").select(leadSelect).eq("lead_id", params.leadId).single();

  const { data: lead, error: leadError } = await leadQuery;

  if (leadError || !lead) {
    return { ok: false as const, status: 404, error: "Lead not found" };
  }

  const leadRow = lead as unknown as LeadRow;
  const salesStatus = (leadRow.sales_status || leadRow.status || "").trim().toLowerCase();
  if (salesStatus !== "quote approved") {
    return { ok: false as const, status: 400, error: "Set Quote Approved to start production" };
  }

  if (leadRow.trello_card_id) {
    const existingJob = await findExistingJobByLead(params.supabase, leadRow);
    return {
      ok: true as const,
      lead_id: leadRow.lead_id,
      job_id: existingJob?.id || null,
      trello_card_id: leadRow.trello_card_id,
      trello_list_id: existingJob?.trello_list_id || null,
      production_stage: leadRow.production_stage || existingJob?.production_stage || null,
      trello_card_url: getTrelloCardUrl(leadRow.trello_card_id),
      trello_short_url: null,
    };
  }

  const existingJob = await findExistingJobByLead(params.supabase, leadRow);
  if (existingJob?.trello_card_id) {
    const cardId = existingJob.trello_card_id;
    await params.supabase
      .from("leads")
      .update({
        trello_card_id: cardId,
        card_created: true,
        production_stage: existingJob.production_stage,
        sales_status: "Quote Approved",
        status: "Quote Approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadRow.id);

    return {
      ok: true as const,
      lead_id: leadRow.lead_id,
      job_id: existingJob.id,
      trello_card_id: cardId,
      trello_list_id: existingJob.trello_list_id,
      production_stage: existingJob.production_stage,
      trello_card_url: existingJob.trello_card_url || getTrelloCardUrl(cardId),
      trello_short_url: null,
    };
  }

  const title = params.cardTitle?.trim() || formatCardTitle(leadRow);
  const paymentStatus = leadRow.payment_status || "Pending";
  const description = buildDescription({
    lead: leadRow,
    jobId: params.jobId,
    productList: params.productList,
    paymentStatus,
  });

  const trelloResult = await createTrelloCard({
    name: title,
    description,
    listId: params.targetListId || TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION,
  });

  if ("error" in trelloResult) {
    return { ok: false as const, status: 500, error: trelloResult.error };
  }

  const listName = (await fetchTrelloListName(params.targetListId)) || "Orders Awaiting confirmation";
  const productionStage = listName.trim();

  const jobUpdatePayload = {
    lead_id: leadRow.id,
    trello_card_id: trelloResult.id,
    trello_card_url: trelloResult.url,
    trello_list_id: params.targetListId,
    production_stage: productionStage,
    payment_status: paymentStatus,
    sales_status: "Quote Approved",
  };

  if (existingJob?.id) {
    await params.supabase.from("jobs").update(jobUpdatePayload).eq("id", existingJob.id);
  } else {
    const { error: insertUuidError } = await params.supabase.from("jobs").insert({ id: params.jobId, ...jobUpdatePayload });
    if (insertUuidError) {
      const { error: insertTextError } = await params.supabase.from("jobs").insert({
        id: params.jobId,
        ...jobUpdatePayload,
        lead_id: leadRow.lead_id,
      });
      if (insertTextError) {
        return { ok: false as const, status: 500, error: insertTextError.message || "Failed to create job" };
      }
    }
  }

  await params.supabase
    .from("leads")
    .update({
      trello_card_id: trelloResult.id,
      card_created: true,
      production_stage: productionStage,
      sales_status: "Quote Approved",
      status: "Quote Approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadRow.id);

  await params.supabase.from("lead_events").insert({
    lead_db_id: leadRow.id,
    actor_user_id: params.actorUserId,
    event_type: "job_created",
    payload: {
      jobId: params.jobId,
      trelloCardId: trelloResult.id,
      trelloCardUrl: trelloResult.url,
      stage: productionStage,
    },
  });

  revalidatePath(`/leads/${leadRow.lead_id}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");

  return {
    ok: true as const,
    lead_id: leadRow.lead_id,
    job_id: params.jobId,
    trello_card_id: trelloResult.id,
    trello_list_id: params.targetListId,
    production_stage: productionStage,
    trello_card_url: trelloResult.url,
    trello_short_url: trelloResult.shortUrl,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId") || "";
  const supabase = await createClient();
  const actor = await getActorOrReject(supabase);
  if (!actor.ok) return actor.response;

  if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });

  const baseSelect = "id, lead_id, trello_card_id, production_stage";
  const leadQuery = isUuid(leadId)
    ? supabase.from("leads").select(baseSelect).eq("id", leadId).maybeSingle()
    : supabase.from("leads").select(baseSelect).eq("lead_id", leadId).maybeSingle();
  const { data: lead } = await leadQuery;
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const leadRow = lead as unknown as { id: string; lead_id: string; trello_card_id: string | null; production_stage: string | null };
  const existingCardId = leadRow.trello_card_id;
  if (!existingCardId) {
    return NextResponse.json({ success: true, trello_card_id: null });
  }

  return NextResponse.json({
    success: true,
    lead_id: leadRow.lead_id,
    trello_card_id: existingCardId,
    trello_card_url: getTrelloCardUrl(existingCardId),
    production_stage: leadRow.production_stage || null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const actor = await getActorOrReject(supabase);
  if (!actor.ok) return actor.response;

  let leadId = "";
  let jobId = "";
  let cardTitle = "";
  let targetListId = TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION;
  let productList = "";

  try {
    const json = await request.json();
    if (json && typeof json.leadId === "string") leadId = json.leadId;
    if (json && typeof json.jobId === "string") jobId = json.jobId;
    if (json && typeof json.card_title === "string") cardTitle = json.card_title;
    if (json && typeof json.target_list_id === "string") targetListId = json.target_list_id;
    if (json && typeof json.product_list === "string") productList = json.product_list;
  } catch {
  }

  if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
  if (!jobId) return NextResponse.json({ error: "Job ID required" }, { status: 400 });
  if (!targetListId) return NextResponse.json({ error: "Target list required" }, { status: 400 });

  const result = await createOrReturnExisting({
    supabase,
    actorUserId: actor.user.id,
    leadId,
    jobId,
    cardTitle,
    targetListId,
    productList,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ success: true, ...result });
}
