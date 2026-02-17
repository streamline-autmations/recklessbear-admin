"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const assignToMeSchema = z.object({
  leadId: z.string().uuid(),
});

const deleteLeadSchema = z.object({
  leadId: z.string().uuid(),
});

export async function autoAssignAllLeadsAction(): Promise<{ error?: string; assigned?: number } | void> {
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

  if (!profile) {
    return { error: "Unauthorized" };
  }

  const role = profile.role;
  if (role !== "admin" && role !== "ceo") {
    return { error: "Unauthorized" };
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 2);
  const cutoffIso = cutoff.toISOString();

  const { data: reps, error: repsError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("role", "rep");

  if (repsError) {
    return { error: repsError.message || "Failed to load reps" };
  }

  const repIds = (reps || []).map((r) => r.user_id).filter(Boolean) as string[];
  if (repIds.length === 0) {
    return { error: "No reps available" };
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, status")
    .is("assigned_rep_id", null)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(10000);

  if (leadsError) {
    return { error: leadsError.message || "Failed to load leads" };
  }

  const leadRows = (leads || []).filter((l) => !!l.id) as Array<{ id: string; status: string | null }>;
  if (leadRows.length === 0) {
    return { assigned: 0 };
  }

  const assignments = new Map<string, string[]>();
  for (let i = 0; i < leadRows.length; i++) {
    const repId = repIds[i % repIds.length];
    const list = assignments.get(repId) || [];
    list.push(leadRows[i].id);
    assignments.set(repId, list);
  }

  const nowIso = new Date().toISOString();
  const chunkSize = 200;

  for (const [repId, ids] of assignments.entries()) {
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);

      const { error: updateError } = await supabase
        .from("leads")
        .update({ assigned_rep_id: repId, updated_at: nowIso })
        .in("id", chunk);

      if (updateError) {
        return { error: updateError.message || "Failed to assign leads" };
      }

      const { error: statusError } = await supabase
        .from("leads")
        .update({ status: "Assigned", updated_at: nowIso })
        .in("id", chunk)
        .or("status.is.null,status.eq.New,status.eq.new");

      if (statusError) {
        return { error: statusError.message || "Failed to update lead status" };
      }
    }
  }

  revalidatePath("/leads");
  return { assigned: leadRows.length };
}

export async function assignToMeAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
  };

  const result = assignToMeSchema.safeParse(rawFormData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
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

  if (!profile) {
    return { error: "Unauthorized" };
  }

  const role = profile.role;
  if (role !== "rep" && role !== "admin" && role !== "ceo") {
    return { error: "Unauthorized" };
  }

  const modifierName = profile.full_name || profile.email || user.email || "User";

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("assigned_rep_id, status")
    .eq("id", result.data.leadId)
    .single();

  if (leadError || !leadRow) {
    return { error: "Lead not found" };
  }

  if (leadRow.assigned_rep_id) {
    return { error: "Lead already assigned" };
  }

  const updateData: { assigned_rep_id: string; status?: string; updated_at: string; last_modified: string; last_modified_by: string } = {
    assigned_rep_id: user.id,
    updated_at: new Date().toISOString(),
    last_modified: new Date().toISOString(),
    last_modified_by: modifierName,
  };

  if (leadRow.status === "New") {
    updateData.status = "Assigned";
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", result.data.leadId);

  if (updateError) {
    return { error: updateError.message || "Failed to assign lead" };
  }

  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "rep_self_assigned",
    payload: {},
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${result.data.leadId}`);
}

export async function deleteLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    leadId: formData.get("leadId") as string,
  };

  const result = deleteLeadSchema.safeParse(rawFormData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
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
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Unauthorized" };
  }

  const role = profile.role;
  if (role !== "admin" && role !== "ceo") {
    return { error: "Unauthorized" };
  }

  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", result.data.leadId)
    .select("id");

  if (error) {
    return { error: error.message || "Failed to delete lead" };
  }

  if (!data || data.length === 0) {
    return { error: "Lead not found" };
  }

  revalidatePath("/leads");
}
