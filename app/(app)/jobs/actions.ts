"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { createTrelloJobCard, type JobCardData } from "@/lib/trello";

const createJobSchema = z.object({
  leadId: z.string().uuid(),
  invoiceNumber: z.string().optional(),
  orderDeadline: z.string().optional(),
  orderQuantity: z.coerce.number().optional(),
  productList: z.string().optional(),
});

const updateJobStageSchema = z.object({
  jobId: z.string().uuid(),
  stage: z.string(),
});

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `JOB-${year}-${random}`;
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

/**
 * Create a job from a lead and create a Trello card
 */
export async function createJobAction(formData: FormData) {
  const rawData = {
    leadId: formData.get("leadId"),
    invoiceNumber: formData.get("invoiceNumber"),
    orderDeadline: formData.get("orderDeadline"),
    orderQuantity: formData.get("orderQuantity"),
    productList: formData.get("productList"),
  };

  const result = createJobSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Get lead details
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", result.data.leadId)
    .single();

  if (leadError || !lead) {
    return { error: "Lead not found" };
  }

  // Check if job already exists for this lead
  const { data: existingJob } = await supabase
    .from("jobs")
    .select("id, trello_card_id, trello_card_url, trello_list_id, production_stage")
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (existingJob?.trello_card_id) {
    return { success: true, job: existingJob, trelloUrl: existingJob.trello_card_url || null };
  }

  // Generate job ID
  const jobId = generateJobId();

  // Determine payment status
  const paymentStatus = lead.payment_status || "Pending";

  // Prepare Trello card data
  const cardData: JobCardData = {
    leadId: lead.lead_id,
    jobId: jobId,
    customerName: lead.customer_name || lead.name || "Unknown",
    organization: lead.organization,
    email: lead.email,
    phone: lead.phone,
    location: lead.location,
    invoiceNumber: result.data.invoiceNumber,
    paymentStatus: paymentStatus,
    orderQuantity: result.data.orderQuantity,
    orderDeadline: result.data.orderDeadline,
    productList: result.data.productList || lead.trello_product_list,
    designNotes: lead.design_notes,
    productType: lead.product_type,
  };

  // Create Trello card
  const trelloResult = await createTrelloJobCard(cardData);

  if ("error" in trelloResult) {
    return { error: `Failed to create Trello card: ${trelloResult.error}` };
  }

  const listName = (await fetchTrelloListName(trelloResult.listId)) || "Orders Awaiting Confirmation";
  const initialStage = listName.trim();

  const jobInsertPayload = {
    lead_id: lead.id,
    trello_card_id: trelloResult.id,
    trello_card_url: trelloResult.url,
    trello_list_id: trelloResult.listId,
    production_stage: initialStage,
    invoice_number: result.data.invoiceNumber,
    payment_status: paymentStatus,
    order_deadline: result.data.orderDeadline ? new Date(result.data.orderDeadline).toISOString() : null,
    order_quantity: result.data.orderQuantity,
    product_list: result.data.productList ? JSON.parse(result.data.productList) : null,
  };

  const { data: job, error: jobError } = existingJob?.id
    ? await supabase.from("jobs").update(jobInsertPayload).eq("id", existingJob.id).select().single()
    : await supabase.from("jobs").insert(jobInsertPayload).select().single();

  if (jobError) {
    return { error: `Failed to create job: ${jobError.message}` };
  }

  // Update lead with card info and status
  await supabase
    .from("leads")
    .update({
      trello_card_id: trelloResult.id,
      card_created: true,
      sales_status: "Quote Approved",
      status: "Quote Approved",
      production_stage: initialStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", result.data.leadId);

  await supabase.from("job_stage_history").insert({
    job_id: job.id,
    trello_card_id: trelloResult.id,
    trello_list_id: trelloResult.listId,
    stage: initialStage,
    from_stage: null,
    to_stage: initialStage,
    moved_at: new Date().toISOString(),
    source: "admin_create",
  });

  // Log event
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "job_created",
    payload: {
      jobId: job.id,
      trelloCardId: trelloResult.id,
      trelloCardUrl: trelloResult.url,
    },
  });

  revalidatePath("/leads");
  revalidatePath("/jobs");
  revalidatePath(`/leads/${result.data.leadId}`);

  return {
    success: true,
    job: job,
    trelloUrl: trelloResult.url,
  };
}

/**
 * Update job production stage (called from Trello webhook or manually)
 */
export async function updateJobStageAction(formData: FormData) {
  const rawData = {
    jobId: formData.get("jobId"),
    stage: formData.get("stage"),
  };

  const result = updateJobStageSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();

  const { data: currentJob } = await supabase
    .from("jobs")
    .select("id, lead_id, production_stage, trello_card_id, trello_list_id")
    .eq("id", result.data.jobId)
    .single();

  if (!currentJob) {
    return { error: "Job not found" };
  }

  if ((currentJob.production_stage || "") === result.data.stage) {
    return { success: true };
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      production_stage: result.data.stage,
    })
    .eq("id", result.data.jobId);

  if (error) {
    return { error: error.message };
  }

  await supabase.from("job_stage_history").insert({
    job_id: currentJob.id,
    trello_card_id: currentJob.trello_card_id,
    trello_list_id: currentJob.trello_list_id,
    stage: result.data.stage,
    from_stage: currentJob.production_stage,
    to_stage: result.data.stage,
    moved_at: new Date().toISOString(),
    source: "admin_manual",
  });

  await supabase
    .from("leads")
    .update({
      production_stage: result.data.stage,
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", currentJob.lead_id);

  revalidatePath("/jobs");
  revalidatePath("/leads");

  return { success: true };
}

/**
 * Get job by lead ID
 */
export async function getJobByLeadId(leadId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("lead_id", leadId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
