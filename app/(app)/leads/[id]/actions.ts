"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { randomUUID } from "crypto";

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

  // Get current user's name/email for last_modified_by
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", user.id)
    .single();
  
  const modifierName = profile?.full_name || user.email || "Admin";

  // Get current lead details (status, card_id, etc.)
  const { data: currentLead } = await supabase
    .from("leads")
    .select(
      "id, status, card_id, lead_id, customer_name, name, email, phone, organization, payment_status, trello_product_list, design_notes, product_type, production_stage"
    )
    .eq("id", result.data.leadId)
    .single();

  if (!currentLead) {
    return { error: "Lead not found" };
  }

  const oldStatus = currentLead.status;
  const newStatus = result.data.status;
  
  // Phase 3: Sales -> Job Conversion Logic
  let trelloUpdateData: Record<string, unknown> = {};
  let jobCreated = false;
  let createdJobId: string | null = null;
  let createdTrelloListId: string | null = null;
  
  if (newStatus === "Quote Approved") {
    const { createTrelloJobCard, LIST_ID_TO_STAGE, TRELLO_LISTS } = await import("@/lib/trello");

    const paymentStatus = (currentLead.payment_status as string | null) || "Pending";

    const { data: existingJob, error: jobLookupError } = await supabase
      .from("jobs")
      .select("id, trello_card_id, trello_list_id, production_stage")
      .eq("lead_id", result.data.leadId)
      .is("archived_at", null)
      .eq("is_active", true)
      .maybeSingle();

    if (jobLookupError) {
      return { error: jobLookupError.message || "Failed to check existing job" };
    }

    const jobId = existingJob?.id || randomUUID();

    const needsTrelloCard = !currentLead.card_id && !existingJob?.trello_card_id;

    if (needsTrelloCard) {
      const cardData = {
        leadId: currentLead.lead_id as string,
        jobId,
        customerName: (currentLead.customer_name || currentLead.name || currentLead.lead_id) as string,
        organization: currentLead.organization as string | null,
        email: currentLead.email as string | null,
        phone: currentLead.phone as string | null,
        paymentStatus,
        orderQuantity: null,
        orderDeadline: null,
        productList: (currentLead.trello_product_list as string | null) || null,
        designNotes: (currentLead.design_notes as string | null) || null,
        productType: (currentLead.product_type as string | null) || null,
        listId: TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION,
      };

      const cardResult = await createTrelloJobCard(cardData);

      if ("error" in cardResult) {
        return { error: `Failed to create Trello card: ${cardResult.error}` };
      }

      const initialStage = LIST_ID_TO_STAGE[cardResult.listId] || "orders_awaiting_confirmation";

      if (existingJob) {
        const nowIso = new Date().toISOString();
        const { error: updateJobError } = await supabase
          .from("jobs")
          .update({
            trello_card_id: cardResult.id,
            trello_list_id: cardResult.listId,
            production_stage: initialStage,
            sales_status: "Quote Approved",
            payment_status: paymentStatus,
            updated_at: nowIso,
          })
          .eq("id", existingJob.id);

        if (updateJobError) {
          return { error: updateJobError.message || "Failed to update job" };
        }

        await supabase
          .from("job_stage_history")
          .update({ exited_at: nowIso })
          .eq("job_id", existingJob.id)
          .is("exited_at", null);

        await supabase.from("job_stage_history").insert({
          job_id: existingJob.id,
          stage: initialStage,
          entered_at: nowIso,
        });
      } else {
        const { error: createJobError } = await supabase.from("jobs").insert({
          id: jobId,
          lead_id: result.data.leadId,
          trello_card_id: cardResult.id,
          trello_list_id: cardResult.listId,
          production_stage: initialStage,
          sales_status: "Quote Approved",
          payment_status: paymentStatus,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (createJobError) {
          return { error: createJobError.message || "Failed to create job" };
        }

        await supabase.from("job_stage_history").insert({
          job_id: jobId,
          stage: initialStage,
          entered_at: new Date().toISOString(),
        });
      }

      trelloUpdateData = {
        card_id: cardResult.id,
        card_created: true,
        production_stage: initialStage,
      };

      jobCreated = true;
      createdJobId = jobId;
      createdTrelloListId = cardResult.listId;
    } else if (!existingJob) {
      const { error: createJobError } = await supabase.from("jobs").insert({
        id: jobId,
        lead_id: result.data.leadId,
        trello_card_id: currentLead.card_id,
        trello_list_id: null,
        production_stage: currentLead.production_stage || null,
        sales_status: "Quote Approved",
        payment_status: paymentStatus,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (createJobError) {
        return { error: createJobError.message || "Failed to create job" };
      }

      jobCreated = true;
      createdJobId = jobId;
    }
  }

  // Update lead status with audit fields and potential Trello data
  const { error: updateError } = await supabase
    .from("leads")
    .update({ 
      status: newStatus,
      sales_status: newStatus, // Sync sales_status with status
      ...trelloUpdateData,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to update status" };
  }

  // Insert event - using lead_db_id
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "status_changed",
    payload: { from: oldStatus, to: newStatus },
  });
  
  if (jobCreated) {
    await supabase.from("lead_events").insert({
      lead_db_id: result.data.leadId,
      actor_user_id: user.id,
      event_type: "job_created",
      payload: { 
        jobId: createdJobId,
        cardId: trelloUpdateData.card_id,
        trelloListId: createdTrelloListId,
        initialStage: trelloUpdateData.production_stage,
      },
    });
  }

  revalidatePath(`/leads/${result.data.leadId}`);
  revalidatePath("/jobs");
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
): Promise<{ error?: string } | void> {
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

  const modifierName = profile?.full_name || user.email || "Admin";

  // Get lead details
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, lead_id, customer_name, name, email, phone, organization, trello_product_list, design_notes, delivery_date, card_id")
    .eq("id", result.data.leadId)
    .single();

  if (leadError || !lead) {
    return { error: "Lead not found" };
  }

  if (lead.card_id) {
    return { error: "Trello card already exists for this lead" };
  }

  // Import createTrelloCard dynamically (server-only)
  const { createTrelloCard } = await import("@/lib/trello");

  // Create Trello card
  const cardName = `Lead: ${lead.customer_name || lead.name || lead.lead_id}`;
  
  const descriptionParts = [
    `Lead ID: ${lead.lead_id}`,
    `Customer: ${lead.customer_name || lead.name || "N/A"}`,
    `Email: ${lead.email || "N/A"}`,
    `Phone: ${lead.phone || "N/A"}`,
    `Organization: ${lead.organization || "N/A"}`,
    lead.delivery_date ? `Delivery Date: ${lead.delivery_date}` : null,
    "",
    "---PRODUCT LIST---",
    lead.trello_product_list || "(No product list provided)",
    "---END LIST---",
    "",
    "Design Notes:",
    lead.design_notes || "(No design notes)",
    "",
    "Created from RecklessBear Admin"
  ];

  const cardDescription = descriptionParts.filter(part => part !== null).join("\n");

  const cardResult = await createTrelloCard({
    name: cardName,
    description: cardDescription,
  });

  if ("error" in cardResult) {
    return { error: cardResult.error };
  }

  // Update lead with card info
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      card_id: cardResult.id,
      card_created: true,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to update lead with card info" };
  }

  // Create event
  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "trello_card_created",
    payload: { cardId: cardResult.id, cardUrl: cardResult.url },
  });

  revalidatePath(`/leads/${lead.lead_id}`);
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
