import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractCardInfo(payload: unknown): { trelloCardId: string | null; trelloCardUrl: string | null } {
  if (!payload || typeof payload !== "object") return { trelloCardId: null, trelloCardUrl: null };
  const obj = payload as Record<string, unknown>;

  const trelloCardId =
    pickString(obj.trello_card_id) ||
    pickString(obj.card_id) ||
    pickString(obj.cardId) ||
    pickString(obj.id) ||
    null;

  const trelloCardUrl =
    pickString(obj.trello_card_url) ||
    pickString(obj.card_url) ||
    pickString(obj.url) ||
    pickString(obj.shortUrl) ||
    null;

  return { trelloCardId, trelloCardUrl };
}

async function getActorOrReject(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  return { ok: true as const, user };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const actor = await getActorOrReject(supabase);
  if (!actor.ok) return actor.response;

  let leadId = "";
  let jobId = "";
  let cardTitle = "";
  let targetListId = "";
  let productList = "";
  let cardDescription = "";

  try {
    const json = await request.json();
    if (json && typeof json.leadId === "string") leadId = json.leadId;
    if (json && typeof json.jobId === "string") jobId = json.jobId;
    if (json && typeof json.card_title === "string") cardTitle = json.card_title;
    if (json && typeof json.target_list_id === "string") targetListId = json.target_list_id;
    if (json && typeof json.product_list === "string") productList = json.product_list;
    if (json && typeof json.card_description === "string") cardDescription = json.card_description;
  } catch {
  }

  if (!leadId) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
  if (!jobId) return NextResponse.json({ error: "Job ID required" }, { status: 400 });

  const leadSelect =
    "id, lead_id, customer_name, name, email, phone, organization, status, sales_status, payment_status, production_stage, delivery_date, design_notes, trello_product_list, selected_apparel_items, card_id, card_created";
  const leadQuery = isUuid(leadId)
    ? supabase.from("leads").select(leadSelect).eq("id", leadId).single()
    : supabase.from("leads").select(leadSelect).eq("lead_id", leadId).single();

  const { data: lead, error: leadError } = await leadQuery;
  if (leadError || !lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const currentStatus = String(lead.sales_status || lead.status || "").trim().toLowerCase();
  if (currentStatus !== "quote approved") {
    return NextResponse.json({ error: "Set Quote Approved to start production" }, { status: 400 });
  }

  const webhookUrl = process.env.N8N_CARD_CREATE_WEBHOOK_URL || "https://dockerfile-1n82.onrender.com/webhook/card-create";

  const payload = {
    source: "recklessbear-admin",
    type: "card-create",
    requested_at: new Date().toISOString(),
    actor_user_id: actor.user.id,
    lead: {
      id: lead.id,
      lead_id: lead.lead_id,
      customer_name: lead.customer_name,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      organization: lead.organization,
      status: lead.status,
      sales_status: lead.sales_status,
      payment_status: lead.payment_status,
      production_stage: lead.production_stage,
      delivery_date: lead.delivery_date,
      design_notes: lead.design_notes,
      trello_product_list: lead.trello_product_list,
      selected_apparel_items: lead.selected_apparel_items,
      card_id: lead.card_id,
      card_created: lead.card_created,
    },
    card: {
      job_id: jobId,
      card_title: cardTitle,
      target_list_id: targetListId || null,
      product_list: productList,
      card_description: cardDescription,
    },
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const responseText = await response.text().catch(() => "");
  let responseJson: unknown = null;
  try {
    responseJson = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseJson = null;
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "n8n webhook error",
        status: response.status,
        details: responseJson || responseText || null,
      },
      { status: 502 }
    );
  }

  const cardInfo = extractCardInfo(responseJson);

  await supabase.from("jobs").upsert(
    {
      id: jobId,
      lead_id: lead.lead_id,
      production_stage: lead.production_stage || "Orders Awaiting confirmation",
      payment_status: lead.payment_status || "Pending",
      trello_card_id: cardInfo.trelloCardId,
      trello_card_url: cardInfo.trelloCardUrl,
    },
    { onConflict: "id" }
  );

  if (cardInfo.trelloCardId) {
    await supabase
      .from("leads")
      .update({
        card_id: cardInfo.trelloCardId,
        card_created: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }

  await supabase.from("lead_events").insert({
    lead_db_id: lead.id,
    actor_user_id: actor.user.id,
    event_type: "n8n_card_create_requested",
    payload: {
      jobId,
      webhookUrl,
      target_list_id: targetListId || null,
      card_title: cardTitle,
      trello_card_id: cardInfo.trelloCardId,
      trello_card_url: cardInfo.trelloCardUrl,
    },
  });

  revalidatePath(`/leads/${lead.lead_id}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");

  return NextResponse.json({ success: true, webhook_response: responseJson || responseText || null });
}
