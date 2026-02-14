"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateJobBoardStageSchema = z.object({
  leadId: z.string().uuid(),
  stage: z.string().min(1),
});

export async function updateJobBoardStageAction(formData: FormData) {
  const rawData = {
    leadId: formData.get("leadId"),
    stage: formData.get("stage"),
  };

  const result = updateJobBoardStageSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  const modifierName = profile.full_name || profile.email || user.email || "Admin";

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, production_stage")
    .eq("id", result.data.leadId)
    .single();

  if (leadErr || !lead) {
    return { error: leadErr?.message || "Lead not found" };
  }

  const fromStage = (lead.production_stage as string | null) || null;
  const toStage = result.data.stage;
  if ((fromStage || "") === toStage) {
    return { success: true };
  }

  const nowIso = new Date().toISOString();

  const { error: leadUpdErr } = await supabase
    .from("leads")
    .update({
      production_stage: toStage,
      updated_at: nowIso,
      last_modified: nowIso,
      last_modified_by: modifierName,
    })
    .eq("id", result.data.leadId);

  if (leadUpdErr) return { error: leadUpdErr.message };

  const { data: job } = await supabase
    .from("jobs")
    .select("id, trello_card_id, trello_list_id, production_stage")
    .eq("lead_id", result.data.leadId)
    .maybeSingle();

  if (job?.id) {
    await supabase
      .from("jobs")
      .update({ production_stage: toStage, updated_at: nowIso })
      .eq("id", job.id);

    await supabase.from("job_stage_history").insert({
      job_id: job.id,
      trello_card_id: job.trello_card_id,
      trello_list_id: job.trello_list_id,
      stage: toStage,
      from_stage: (job.production_stage as string | null) || fromStage,
      to_stage: toStage,
      moved_at: nowIso,
      source: "admin_board",
    });
  }

  await supabase.from("lead_events").insert({
    lead_db_id: result.data.leadId,
    actor_user_id: user.id,
    event_type: "production_stage_updated",
    payload: { from: fromStage, to: toStage },
  });

  revalidatePath("/jobs");
  revalidatePath(`/leads/${result.data.leadId}`);

  return { success: true };
}

