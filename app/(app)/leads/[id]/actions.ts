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
  status: z.enum(["New", "Assigned", "Contacted", "Quote Sent", "Quote Approved"]),
});

const assignRepSchema = z.object({
  leadId: z.string().uuid(),
  repId: z.string().uuid().or(z.literal("")), // Allow empty string for unassigning
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

  // Update lead status
  const { error: updateError } = await supabase
    .from("leads")
    .update({ status: newStatus })
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
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized: Only CEO/Admin can assign reps" };
  }

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
    const updateData: { assigned_rep_id: null } = {
      assigned_rep_id: null,
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

  // Get rep profile for label (only if assigning)
  const { data: repProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", result.data.repId)
    .single();

  const repLabel = repProfile?.full_name || result.data.repId;

  // Update lead - set assigned_rep_id and optionally update status
  const updateData: { assigned_rep_id: string; status?: string } = {
    assigned_rep_id: result.data.repId,
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
