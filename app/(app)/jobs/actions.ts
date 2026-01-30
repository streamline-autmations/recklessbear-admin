"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { createTrelloJobCard, LIST_ID_TO_STAGE, type JobCardData } from "@/lib/trello";

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
    .select("id")
    .eq("lead_id", lead.lead_id)
    .single();

  if (existingJob) {
    return { error: "A job already exists for this lead" };
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

  // Determine initial production stage based on list
  const initialStage = LIST_ID_TO_STAGE[trelloResult.listId] || "orders_awaiting_confirmation";

  // Create job record
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      lead_id: lead.lead_id,
      trello_card_id: trelloResult.id,
      trello_card_url: trelloResult.url,
      production_stage: initialStage,
      invoice_number: result.data.invoiceNumber,
      payment_status: paymentStatus,
      order_deadline: result.data.orderDeadline ? new Date(result.data.orderDeadline).toISOString() : null,
      order_quantity: result.data.orderQuantity,
      product_list: result.data.productList ? JSON.parse(result.data.productList) : null,
    })
    .select()
    .single();

  if (jobError) {
    return { error: `Failed to create job: ${jobError.message}` };
  }

  // Update lead with card info and status
  await supabase
    .from("leads")
    .update({
      card_id: trelloResult.id,
      card_created: true,
      sales_status: "Quote Approved",
      production_stage: initialStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", result.data.leadId);

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

  // Update job stage
  const { error } = await supabase
    .from("jobs")
    .update({
      production_stage: result.data.stage,
    })
    .eq("id", result.data.jobId);

  if (error) {
    return { error: error.message };
  }

  // Get job to update lead
  const { data: job } = await supabase
    .from("jobs")
    .select("lead_id")
    .eq("id", result.data.jobId)
    .single();

  if (job) {
    // Update lead's production_stage
    await supabase
      .from("leads")
      .update({
        production_stage: result.data.stage,
        updated_at: new Date().toISOString(),
      })
      .eq("lead_id", job.lead_id);
  }

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
