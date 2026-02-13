import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { ensureJobAndTrelloCardForLead } from "@/lib/trello-sync";

async function getActorOrReject(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }

  return { ok: true as const, user, profile };
}

async function handle(request: NextRequest, leadId: string) {
  const supabase = await createClient();
  const actor = await getActorOrReject(supabase);
  if (!actor.ok) return actor.response;

  if (!leadId) {
    return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
  }

  const ensured = await ensureJobAndTrelloCardForLead({
    supabase,
    leadDbId: leadId,
    actorUserId: actor.user.id,
    actorEmail: actor.user.email,
    actorProfile: actor.profile,
  });

  if (ensured.ok === false) {
    return NextResponse.json({ error: ensured.error }, { status: ensured.status || 500 });
  }

  revalidatePath(`/leads/${ensured.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/jobs");

  return NextResponse.json({
    success: true,
    lead_id: ensured.leadId,
    job_id: ensured.jobId,
    trello_card_id: ensured.trelloCardId,
    trello_list_id: ensured.trelloListId,
    production_stage: ensured.productionStage,
    trello_card_url: ensured.trelloUrl || null,
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId") || "";
  return handle(request, leadId);
}

export async function POST(request: NextRequest) {
  let leadId = "";
  try {
    const json = await request.json();
    if (json && typeof json.leadId === "string") leadId = json.leadId;
  } catch {
  }
  return handle(request, leadId);
}
