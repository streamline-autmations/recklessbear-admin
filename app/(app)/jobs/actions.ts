"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { LIST_ID_TO_STAGE } from "@/lib/trello";

const syncJobSchema = z.object({
  jobId: z.string().uuid(),
});

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

export async function syncJobFromTrelloAction(formData: FormData): Promise<{ error?: string } | void> {
  const rawFormData = {
    jobId: formData.get("jobId") as string,
  };

  const result = syncJobSchema.safeParse(rawFormData);
  if (!result.success) {
    return { error: result.error.issues[0]?.message || "Invalid input" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, lead_id, trello_card_id, trello_list_id, production_stage")
    .eq("id", result.data.jobId)
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
