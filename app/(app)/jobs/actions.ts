"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { LIST_ID_TO_STAGE, STAGE_TO_LIST_ID, moveTrelloCard } from "@/lib/trello";

const syncJobSchema = z.object({
  jobId: z.string().uuid(),
});

const moveJobSchema = z.object({
  jobId: z.string().uuid(),
  stage: z.string().min(1),
});

const jobPanelSchema = z.object({
  jobId: z.string().uuid(),
});

export type JobStageHistoryRow = {
  stage: string | null;
  entered_at: string | null;
  exited_at: string | null;
};

export type JobPanelData = {
  job: {
    id: string;
    trello_card_id: string | null;
    production_stage: string | null;
    payment_status: string | null;
    sales_status: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    lead: {
      lead_id: string | null;
      customer_name: string | null;
      name: string | null;
      organization: string | null;
      email: string | null;
      phone: string | null;
      product_type?: string | null;
      trello_product_list?: string | null;
      assigned_rep_id?: string | null;
    } | null;
  };
  history: JobStageHistoryRow[];
};

async function getTrelloListId(cardId: string): Promise<string | null> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!apiKey || !token) return null;

  const response = await fetch(
    `https://api.trello.com/1/cards/${cardId}?key=${apiKey}&token=${token}&fields=idList`,
    { method: "GET" }
  );

  if (!response.ok) return null;
  const card = (await response.json()) as { idList?: string };
  return card.idList || null;
}

async function assertAuthenticated() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function assertAdminOrCeo() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized" as const };
  }

  return { supabase, user, profile };
}

export async function getJobPanelDataAction(jobId: string): Promise<JobPanelData | { error: string }> {
  const parsed = jobPanelSchema.safeParse({ jobId });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const auth = await assertAuthenticated();
  if ("error" in auth) return { error: auth.error };

  const { supabase } = auth;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      `
        id,
        trello_card_id,
        production_stage,
        sales_status,
        payment_status,
        created_at,
        updated_at,
        lead:leads!jobs_lead_id_fkey (
          lead_id,
          customer_name,
          name,
          organization,
          email,
          phone,
          product_type,
          trello_product_list,
          assigned_rep_id
        )
      `
    )
    .eq("id", parsed.data.jobId)
    .single();

  if (jobError || !job) {
    return { error: jobError?.message || "Job not found" };
  }

  const { data: history } = await supabase
    .from("job_stage_history")
    .select("stage, entered_at, exited_at")
    .eq("job_id", parsed.data.jobId)
    .order("entered_at", { ascending: true, nullsFirst: true })
    .limit(100);

  const lead = Array.isArray(job.lead) ? job.lead[0] : null;

  return {
    job: {
      id: job.id as string,
      trello_card_id: (job.trello_card_id as string | null) || null,
      production_stage: (job.production_stage as string | null) || null,
      payment_status: (job.payment_status as string | null) || null,
      sales_status: (job.sales_status as string | null) || null,
      created_at: (job.created_at as string | null) || null,
      updated_at: (job.updated_at as string | null) || null,
      lead: lead
        ? {
            lead_id: (lead.lead_id as string | null) || null,
            customer_name: (lead.customer_name as string | null) || null,
            name: (lead.name as string | null) || null,
            organization: (lead.organization as string | null) || null,
            email: (lead.email as string | null) || null,
            phone: (lead.phone as string | null) || null,
            product_type: (lead.product_type as string | null) || null,
            trello_product_list: (lead.trello_product_list as string | null) || null,
            assigned_rep_id: (lead.assigned_rep_id as string | null) || null,
          }
        : null,
    },
    history: (history || []) as JobStageHistoryRow[],
  };
}

async function syncJobFromTrello(jobId: string): Promise<{ error?: string } | void> {
  const auth = await assertAdminOrCeo();
  if ("error" in auth) return auth;

  const { supabase } = auth;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, lead_id, trello_card_id, trello_list_id, production_stage")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { error: jobError?.message || "Job not found" };
  }

  if (!job.trello_card_id) {
    return { error: "Job has no Trello card linked" };
  }

  const trelloListId = await getTrelloListId(job.trello_card_id);
  if (!trelloListId) {
    return { error: "Failed to fetch Trello card list" };
  }

  const stage = LIST_ID_TO_STAGE[trelloListId] || null;
  const nowIso = new Date().toISOString();

  await supabase
    .from("jobs")
    .update({
      trello_list_id: trelloListId,
      production_stage: stage,
      updated_at: nowIso,
    })
    .eq("id", job.id);

  await supabase
    .from("leads")
    .update({
      production_stage: stage,
      updated_at: nowIso,
    })
    .eq("id", job.lead_id);

  await supabase
    .from("job_stage_history")
    .update({ exited_at: nowIso })
    .eq("job_id", job.id)
    .is("exited_at", null);

  if (stage) {
    await supabase.from("job_stage_history").insert({
      job_id: job.id,
      stage,
      entered_at: nowIso,
    });
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${job.id}`);
}

export async function syncJobFromTrelloAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    jobId: formData.get("jobId") as string,
  };

  const result = syncJobSchema.safeParse(rawFormData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  return syncJobFromTrello(result.data.jobId);
}

export async function moveJobToStageAction(
  jobId: string,
  stage: string
): Promise<{ error?: string } | { success: true }> {
  const parsed = moveJobSchema.safeParse({ jobId, stage });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const auth = await assertAdminOrCeo();
  if ("error" in auth) return auth;

  const { supabase } = auth;

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, trello_card_id")
    .eq("id", parsed.data.jobId)
    .single();

  if (jobError || !job) {
    return { error: jobError?.message || "Job not found" };
  }

  if (!job.trello_card_id) {
    return { error: "Job has no Trello card linked" };
  }

  const listId = STAGE_TO_LIST_ID[parsed.data.stage];
  if (!listId) {
    return { error: "Target stage is not mapped to a Trello list" };
  }

  const moveResult = await moveTrelloCard(job.trello_card_id, listId);
  if ("error" in moveResult) {
    return { error: moveResult.error };
  }

  const syncResult = await syncJobFromTrello(parsed.data.jobId);
  if (syncResult && "error" in syncResult) return syncResult;

  return { success: true };
}
