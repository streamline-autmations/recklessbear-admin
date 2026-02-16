"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { TRELLO_LISTS } from "@/lib/trello";
import { renderTrelloCardDescription } from "@/lib/trello-card-template";

const addNoteSchema = z.object({
  leadId: z.string().uuid(),
  note: z.string().min(1, "Note cannot be empty").max(10000, "Note is too long"),
});

const deleteNoteSchema = z.object({
  leadId: z.string().uuid(),
  noteId: z.string().uuid(),
});

const changeStatusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(["New", "Assigned", "Contacted", "Quote Sent", "Quote Approved", "In Production", "Completed", "Lost"]),
});

const assignRepSchema = z.object({
  leadId: z.string().uuid(),
  repId: z.string().uuid().or(z.literal("")), // Allow empty string for unassigning
});

const updateDesignNotesSchema = z.object({
  leadId: z.string().uuid(),
  designNotes: z.string().max(50000, "Design notes too long"),
});

const updateLeadFieldsSchema = z.object({
  leadId: z.string().uuid(),
  updates: z.string().min(2),
});

const leadFieldUpdatesSchema = z
  .object({
    apparel_interest: z.string().nullable().optional(),
    selected_apparel_items: z.array(z.string()).nullable().optional(),
    corporate_items: z.array(z.string()).nullable().optional(),
    schoolwear_items: z.array(z.string()).nullable().optional(),
    gym_items: z.array(z.string()).nullable().optional(),
    sports_kits_selected: z.array(z.string()).nullable().optional(),
    rugby_items: z.array(z.string()).nullable().optional(),
    soccer_items: z.array(z.string()).nullable().optional(),
    cricket_items: z.array(z.string()).nullable().optional(),
    netball_items: z.array(z.string()).nullable().optional(),
    hockey_items: z.array(z.string()).nullable().optional(),
    athletics_items: z.array(z.string()).nullable().optional(),
    golf_items: z.array(z.string()).nullable().optional(),
    fishing_items: z.array(z.string()).nullable().optional(),
    warmup_kit: z.boolean().nullable().optional(),
    quantity_known: z.boolean().nullable().optional(),
    quantity_value: z.union([z.string(), z.number()]).nullable().optional(),
    quantity_rough: z.string().nullable().optional(),
    has_deadline: z.boolean().nullable().optional(),
    preferred_deadline_date: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
    design_notes: z.string().nullable().optional(),
    attachments: z.array(z.string()).nullable().optional(),
  })
  .strict();

const createTrelloCardSchema = z.object({
  leadId: z.string().uuid(),
});

export async function addNoteAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    note: formData.get("note") as string,
  };

  const result = addNoteSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Insert note - using lead_db_id as specified by user
  const { error: noteError } = await supabase.from("lead_notes").insert({
    lead_db_id: result.data.leadId,
    author_user_id: user.id,
    note: result.data.note,
  });

  if (noteError) {
    return { error: noteError.message || "Failed to add note" };
  }

  // Insert event - using lead_db_id
  const notePreview = result.data.note.substring(0, 80);
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "note_added",
    payload: { notePreview },
  });

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function deleteNoteAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    noteId: formData.get("noteId") as string,
  };

  const result = deleteNoteSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  const isCeoOrAdmin = profile?.role === "ceo" || profile?.role === "admin";

  const { data: noteRow, error: noteFetchError } = await supabase
    .from("lead_notes")
    .select("id, lead_db_id, author_user_id")
    .eq("id", result.data.noteId)
    .eq("lead_db_id", result.data.leadId)
    .maybeSingle();

  if (noteFetchError) {
    return { error: noteFetchError.message || "Failed to load note" };
  }

  if (!noteRow) {
    return { error: "Note not found" };
  }

  if (!isCeoOrAdmin && noteRow.author_user_id !== user.id) {
    const { data: leadRow } = await supabase
      .from("leads")
      .select("assigned_rep_id")
      .eq("id", result.data.leadId)
      .maybeSingle();

    const isAssignedRep = leadRow?.assigned_rep_id === user.id;
    if (!isAssignedRep) {
      return { error: "Unauthorized" };
    }
  }

  const { error: deleteError } = await supabase
    .from("lead_notes")
    .delete()
    .eq("id", result.data.noteId)
    .eq("lead_db_id", result.data.leadId);

  if (deleteError) {
    return { error: deleteError.message || "Failed to delete note" };
  }

  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "note_deleted",
    payload: { noteId: result.data.noteId },
  });

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function changeStatusAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    status: formData.get("status") as string,
  };

  const result = changeStatusSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get current user's profile for last_modified_by and role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();
  
  const modifierName = profile?.full_name || user.email || "Admin";

  // Get current lead details (status, card_id, etc.)
  const { data: currentLead } = await supabase
    .from("leads")
    .select("status, card_id, lead_id, customer_name, name, production_stage")
    .eq("id", result.data.leadId)
    .single();

  if (!currentLead) {
    return { error: "Lead not found" };
  }

  const oldStatus = currentLead.status;
  const newStatus = result.data.status;
  
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      status: newStatus,
      sales_status: newStatus,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to update status" };
  }

  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "status_changed",
    payload: { from: oldStatus, to: newStatus },
  });

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function assignRepAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    repId: formData.get("repId") as string,
  };

  const result = assignRepSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user and check role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is CEO/Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized: Only CEO/Admin can assign reps" };
  }

  const modifierName = profile?.full_name || user.email || "Admin";

  // Get current lead status
  const { data: currentLead } = await supabase
    .from("leads")
    .select("status")
    .eq("id", result.data.leadId)
    .single();

  if (!currentLead) {
    return { error: "Lead not found" };
  }

  // Handle unassigning (empty repId)
  if (!result.data.repId || result.data.repId === "") {
    const updateData = {
      assigned_rep_id: null,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", result.data.leadId);

    if (updateError) {
      return { error: updateError.message || "Failed to unassign rep" };
    }

    // Insert event for unassignment
    await supabase.from("lead_events").insert({
      lead_db_id: result.data.leadId,
      actor_user_id: user.id,
      event_type: "rep_unassigned",
      payload: {},
    });

    revalidatePath(`/leads/${result.data.leadId}`);
    return;
  }

  // Get rep user for label (only if assigning) - from profiles table
  const { data: repUser } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", result.data.repId)
    .single();

  const repLabel = repUser?.full_name || repUser?.email || result.data.repId;

  // Update lead - set assigned_rep_id and optionally update status
  const updateData: { 
    assigned_rep_id: string; 
    status?: string;
    updated_at: string;
    last_modified: string;
    last_modified_by: string;
  } = {
    assigned_rep_id: result.data.repId,
    updated_at: new Date().toISOString(),
    last_modified: new Date().toISOString(),
    last_modified_by: modifierName,
  };

  // Set status to 'Assigned' if currently 'New'
  if (currentLead.status === "New") {
    updateData.status = "Assigned";
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to assign rep" };
  }

  // Insert event - using lead_db_id
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "rep_assigned",
    payload: { repId: result.data.repId, repLabel },
  });

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function updateDesignNotesAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    designNotes: formData.get("designNotes") as string,
  };

  const result = updateDesignNotesSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Get current user's name/email for last_modified_by
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", user.id)
    .single();
  
  const modifierName = profile?.full_name || user.email || "Admin";

  // Update design notes with audit fields
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      design_notes: result.data.designNotes || null,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to update design notes" };
  }

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function updateLeadFieldsAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
    updates: formData.get("updates") as string,
  };

  const result = updateLeadFieldsSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  let parsedUpdates: unknown;
  try {
    parsedUpdates = JSON.parse(result.data.updates);
  } catch {
    return { error: "Invalid updates payload" };
  }

  const updatesParsed = leadFieldUpdatesSchema.safeParse(parsedUpdates);
  if (!updatesParsed.success) {
    return { error: "Invalid field updates" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized: Only CEO/Admin can edit lead fields" };
  }

  const modifierName = profile?.full_name || user.email || "Admin";

  const updateData: Record<string, unknown> = {
    ...updatesParsed.data,
    updated_at: new Date().toISOString(),
    last_modified: new Date().toISOString(),
    last_modified_by: modifierName,
  };

  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to update lead" };
  }

  const keys = Object.keys(updatesParsed.data);
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "lead_fields_updated",
    payload: { keys },
  });

  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function createTrelloCardAction(
  formData: FormData
): Promise<{ error?: string; message?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
  };

  const result = createTrelloCardSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is CEO/Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized: Only CEO/Admin can create Trello cards" };
  }

  const leadSelect =
    "id, lead_id, customer_name, name, email, phone, organization, status, sales_status, payment_status, production_stage, delivery_date, design_notes, trello_product_list, selected_apparel_items, card_id, card_created";

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(leadSelect)
    .eq("id", result.data.leadId)
    .single();

  if (leadError || !lead) {
    return { error: "Lead not found" };
  }

  const salesStatus = String(lead.sales_status || lead.status || "").trim();
  if (salesStatus !== "Quote Approved") {
    return { error: "Lead is not Quote Approved" };
  }

  const { data: existingJob } = await supabase
    .from("jobs")
    .select("id, trello_card_id")
    .eq("lead_id", lead.lead_id)
    .maybeSingle();

  if (existingJob?.trello_card_id || lead.card_id) {
    return { message: "Trello card already created" };
  }

  const jobId = existingJob?.id || randomUUID();

  if (!existingJob?.id) {
    const { error: jobInsertError } = await supabase.from("jobs").insert({ id: jobId, lead_id: lead.lead_id });
    if (jobInsertError) {
      return { error: "Failed to create job" };
    }
  }

  const selected = Array.isArray(lead.selected_apparel_items) ? lead.selected_apparel_items : null;
  const productList =
    selected && selected.length > 0
      ? selected
          .map((itemRaw) => {
            const item = String(itemRaw || "").trim();
            if (!item) return "";
            return `${item} (STD)\n[Qty], [Size]`;
          })
          .filter(Boolean)
          .join("\n\n")
      : String(lead.trello_product_list || "").trim();

  const leadIdText = String(lead.lead_id || "").trim();
  const customerName = String(lead.customer_name || lead.name || "").trim();
  const org = String(lead.organization || "").trim();
  const cardTitle = customerName && org ? `${customerName} — ${org} (${leadIdText})` : customerName ? `${customerName} (${leadIdText})` : `Lead ${leadIdText}`;

  const cardDescription = renderTrelloCardDescription({
    INVOICE_NUMBER: "[Enter Invoice # Here]",
    PAYMENT_STATUS: String(lead.payment_status || "Pending"),
    JOB_ID: jobId,
    ORDER_QUANTITY: "[Enter Total Quantity]",
    ORDER_DEADLINE: String(lead.delivery_date || "[Enter Deadline]"),
    PRODUCT_LIST: productList || "Product Name (STD)\n[Qty], [Size]",
    CUSTOMER_NAME: customerName || `Lead ${leadIdText}`,
    PHONE: String(lead.phone || "[Enter Phone]"),
    EMAIL: String(lead.email || "[Enter Email]"),
    ORGANIZATION: org || "[Enter Organization]",
    LOCATION: "[Enter Location]",
    DESIGN_NOTES: String(lead.design_notes || "[Add any final design notes here]"),
    LEAD_ID: leadIdText,
    INVOICE_MACHINE: "",
    ORDER_QUANTITY_MACHINE: "",
    ORDER_DEADLINE_MACHINE: String(lead.delivery_date || ""),
  });

  const webhookUrl = process.env.N8N_CARD_CREATE_WEBHOOK_URL || "https://dockerfile-1n82.onrender.com/webhook/create-trello-card";

  const payload = {
    source: "recklessbear-admin",
    requested_at: new Date().toISOString(),
    actor_user_id: user.id,
    lead_id: lead.lead_id,
    job_id: jobId,
    card_title: cardTitle,
    card_description: cardDescription,
    trello_list_id: TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION,
    product_list: productList,
    customer_email: lead.email,
    customer_phone: lead.phone,
    customer_name: lead.customer_name || lead.name || null,
    organization: lead.organization,
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
    return { error: `n8n webhook error (${response.status})` };
  }

  const obj = responseJson && typeof responseJson === "object" ? (responseJson as Record<string, unknown>) : null;
  const pickString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const trelloCardId = pickString(obj?.trello_card_id) || pickString(obj?.card_id) || pickString(obj?.cardId) || pickString(obj?.id) || null;
  const trelloCardUrl =
    pickString(obj?.trello_card_url) ||
    pickString(obj?.trello_url) ||
    pickString(obj?.card_url) ||
    pickString(obj?.url) ||
    pickString(obj?.shortUrl) ||
    null;

  await supabase.from("jobs").upsert(
    {
      id: jobId,
      lead_id: lead.lead_id,
      production_stage: lead.production_stage || "Orders Awaiting confirmation",
      payment_status: lead.payment_status || "Pending",
      trello_card_id: trelloCardId,
      trello_card_url: trelloCardUrl,
    },
    { onConflict: "id" }
  );

  if (trelloCardId) {
    await supabase
      .from("leads")
      .update({
        card_id: trelloCardId,
        card_created: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
  }

  await supabase.from("lead_events").insert({
    lead_db_id: lead.id,
    actor_user_id: user.id,
    event_type: "n8n_card_create_requested",
    payload: {
      jobId,
      webhookUrl,
      target_list_id: TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION,
      card_title: cardTitle,
      trello_card_id: trelloCardId,
      trello_card_url: trelloCardUrl,
    },
  });

  revalidatePath(`/leads/${lead.lead_id}`);
  revalidatePath("/jobs");
  revalidatePath("/leads");

  const message = pickString(obj?.message) || null;
  return { message: message || "Workflow was started" };
}

const autoAssignLeadSchema = z.object({
  leadId: z.string().uuid(),
});

export async function autoAssignLeadAction(
  formData: FormData
): Promise<{ error?: string; repId?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
  };

  const result = autoAssignLeadSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  // Get current user and check role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is CEO/Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized: Only CEO/Admin can auto-assign leads" };
  }

  // Get lead to find lead_id (text field)
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("lead_id")
    .eq("id", result.data.leadId)
    .single();

  if (leadError || !lead) {
    return { error: "Lead not found" };
  }

  // Call RPC function to auto-assign
  const { data: assignedRepId, error: rpcError } = await supabase.rpc(
    "assign_lead_auto",
    { p_lead_id: lead.lead_id }
  );

  if (rpcError) {
    return { error: rpcError.message || "Failed to auto-assign lead" };
  }

  if (!assignedRepId) {
    return { error: "No rep available for assignment" };
  }

  // Insert event
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "rep_auto_assigned",
    payload: { repId: assignedRepId },
  });

  revalidatePath(`/leads/${lead.lead_id}`);
  return { repId: assignedRepId };
}
