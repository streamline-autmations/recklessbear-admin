"use server";

import { createTrelloJobCard, type JobCardData } from "@/lib/trello";
import type { SupabaseClient } from "@supabase/supabase-js";

function normalizeStageName(value: string): string {
  return value.trim();
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

function getModifierName(profile: { full_name?: string | null; email?: string | null } | null, userEmail?: string | null): string {
  return profile?.full_name || profile?.email || userEmail || "Admin";
}

export async function ensureJobAndTrelloCardForLead(params: {
  supabase: SupabaseClient;
  leadDbId: string;
  actorUserId: string;
  actorEmail?: string | null;
  actorProfile?: { role?: string | null; full_name?: string | null; email?: string | null } | null;
}): Promise<
  | { ok: true; leadId: string; jobId: string; trelloCardId: string; trelloListId: string; productionStage: string; trelloUrl?: string | null }
  | { ok: false; error: string; status?: number }
> {
  const modifierName = getModifierName(params.actorProfile, params.actorEmail || null);

  const { data: lead, error: leadError } = await params.supabase
    .from("leads")
    .select(
      "id, lead_id, customer_name, name, email, phone, organization, location, product_type, design_notes, trello_product_list, delivery_date, payment_status, sales_status, status, card_id, production_stage"
    )
    .eq("id", params.leadDbId)
    .single();

  if (leadError || !lead) {
    return { ok: false, error: "Lead not found", status: 404 };
  }

  const salesStatus = (lead.sales_status || lead.status || "").trim();
  if (salesStatus !== "Quote Approved") {
    return { ok: false, error: "Lead is not Quote Approved", status: 400 };
  }

  const { data: existingJob } = await params.supabase
    .from("jobs")
    .select("id, trello_card_id, trello_card_url, trello_list_id, production_stage, lead_id")
    .eq("lead_id", lead.lead_id)
    .maybeSingle();

  if (existingJob?.trello_card_id) {
    const stage = normalizeStageName(existingJob.production_stage || "Orders Awaiting Confirmation");
    if (lead.card_id !== existingJob.trello_card_id || lead.production_stage !== stage) {
      await params.supabase
        .from("leads")
        .update({
          card_id: existingJob.trello_card_id,
          card_created: true,
          production_stage: stage,
          sales_status: "Quote Approved",
          status: "Quote Approved",
          updated_at: new Date().toISOString(),
          last_modified: new Date().toISOString(),
          last_modified_by: modifierName,
        })
        .eq("id", params.leadDbId);
    }

    return {
      ok: true,
      leadId: lead.lead_id,
      jobId: existingJob.id,
      trelloCardId: existingJob.trello_card_id,
      trelloListId: existingJob.trello_list_id || "",
      productionStage: stage,
      trelloUrl: existingJob.trello_card_url || null,
    };
  }

  const { data: job, error: jobInsertError } = existingJob?.id
    ? await params.supabase.from("jobs").select("id, lead_id").eq("id", existingJob.id).single()
    : await params.supabase.from("jobs").insert({ lead_id: lead.lead_id }).select("id, lead_id").single();

  if (jobInsertError || !job) {
    return { ok: false, error: "Failed to create job", status: 500 };
  }

  const paymentStatus = lead.payment_status || "Pending";

  const cardData: JobCardData = {
    leadId: lead.lead_id,
    jobId: job.id,
    customerName: lead.customer_name || lead.name || "Unknown",
    organization: lead.organization,
    email: lead.email,
    phone: lead.phone,
    location: lead.location,
    invoiceNumber: null,
    paymentStatus: paymentStatus,
    orderQuantity: null,
    orderDeadline: lead.delivery_date,
    productList: lead.trello_product_list || null,
    designNotes: lead.design_notes,
    productType: lead.product_type,
  };

  const trelloResult = await createTrelloJobCard(cardData);
  if ("error" in trelloResult) {
    return { ok: false, error: `Failed to create Trello card: ${trelloResult.error}`, status: 500 };
  }

  const listName = (await fetchTrelloListName(trelloResult.listId)) || "Orders Awaiting Confirmation";
  const productionStage = normalizeStageName(listName);

  const { error: jobUpdateError } = await params.supabase
    .from("jobs")
    .update({
      trello_card_id: trelloResult.id,
      trello_card_url: trelloResult.url,
      trello_list_id: trelloResult.listId,
      production_stage: productionStage,
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (jobUpdateError) {
    return { ok: false, error: "Failed to update job with Trello card", status: 500 };
  }

  await params.supabase
    .from("leads")
    .update({
      card_id: trelloResult.id,
      card_created: true,
      production_stage: productionStage,
      sales_status: "Quote Approved",
      status: "Quote Approved",
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", params.leadDbId);

  await params.supabase.from("job_stage_history").insert({
    job_id: job.id,
    trello_card_id: trelloResult.id,
    trello_list_id: trelloResult.listId,
    from_stage: null,
    to_stage: productionStage,
    moved_at: new Date().toISOString(),
    source: "admin_create",
  });

  await params.supabase.from("lead_events").insert({
    lead_db_id: params.leadDbId,
    actor_user_id: params.actorUserId,
    event_type: "job_created",
    payload: { jobId: job.id, trelloCardId: trelloResult.id, trelloCardUrl: trelloResult.url, stage: productionStage },
  });

  return {
    ok: true,
    leadId: lead.lead_id,
    jobId: job.id,
    trelloCardId: trelloResult.id,
    trelloListId: trelloResult.listId,
    productionStage,
    trelloUrl: trelloResult.url,
  };
}
