"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const addNoteSchema = z.object({
  leadId: z.string().uuid(),
  note: z.string().min(1, "Note cannot be empty").max(10000, "Note is too long"),
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

  // Get current status before updating
  const { data: currentLead } = await supabase
    .from("leads")
    .select("status")
    .eq("id", result.data.leadId)
    .single();

  if (!currentLead) {
    return { error: "Lead not found" };
  }

  const oldStatus = currentLead.status;
  const newStatus = result.data.status;

  // Update lead status with audit fields
  const { error: updateError } = await supabase
    .from("leads")
    .update({ 
      status: newStatus,
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

  // Get rep user for label (only if assigning) - from users table
  const { data: repUser } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", result.data.repId)
    .single();

  const repLabel = repUser?.name || repUser?.email || result.data.repId;

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
    .select("id, lead_id, customer_name, name, card_id")
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
  const cardDescription = `Lead ID: ${lead.lead_id}\n\nCreated from RecklessBear Admin`;

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
