import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

type TrelloWebhookPayload = {
  action?: {
    type?: string;
    data?: {
      card?: { id?: string };
      listAfter?: { id?: string; name?: string };
      listBefore?: { id?: string; name?: string };
      board?: { id?: string };
    };
  };
};

function normalizeStageName(name: string): string {
  return name.trim();
}

function jsonOk() {
  return NextResponse.json({ ok: true });
}

export async function HEAD() {
  return jsonOk();
}

export async function GET() {
  return jsonOk();
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const trelloSecret = process.env.TRELLO_WEBHOOK_SECRET;
  const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL;
  const trelloSig = request.headers.get("x-trello-webhook");

  if (trelloSecret && callbackUrl) {
    if (!trelloSig) {
      return NextResponse.json({ error: "Missing Trello signature" }, { status: 401 });
    }
    const expected = crypto.createHmac("sha1", trelloSecret).update(`${callbackUrl}${rawBody}`).digest("base64");
    const a = Buffer.from(trelloSig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid Trello signature" }, { status: 401 });
    }
  } else {
    const configuredSecret = process.env.RB_TRELLO_WEBHOOK_SECRET;
    if (configuredSecret) {
      const provided = request.headers.get("x-rb-webhook-secret");
      if (!provided || provided !== configuredSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  let payload: TrelloWebhookPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as TrelloWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const boardId = payload?.action?.data?.board?.id;
  if (boardId && boardId !== "688caf3f46d3b014e4913ec5") {
    return jsonOk();
  }

  const actionType = payload?.action?.type || "";
  const cardId = payload?.action?.data?.card?.id || "";
  const listAfterId = payload?.action?.data?.listAfter?.id || "";
  const listAfterName = payload?.action?.data?.listAfter?.name || "";
  const listBeforeName = payload?.action?.data?.listBefore?.name || null;

  const isListMove = actionType === "updateCard" && !!cardId && !!listAfterId && !!listAfterName;
  if (!isListMove) {
    return jsonOk();
  }

  const nextStage = normalizeStageName(listAfterName);

  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, lead_id, trello_card_id, trello_list_id, production_stage")
    .eq("trello_card_id", cardId)
    .maybeSingle();

  if (!job) {
    return jsonOk();
  }

  if ((job.production_stage || "") === nextStage && (job.trello_list_id || "") === listAfterId) {
    return jsonOk();
  }

  const fromStage = (job.production_stage || listBeforeName || null) ? String(job.production_stage || listBeforeName || "").trim() : null;

  const { error: updateJobError } = await supabase
    .from("jobs")
    .update({
      trello_list_id: listAfterId,
      production_stage: nextStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  if (updateJobError) {
    return NextResponse.json({ error: updateJobError.message || "Failed to update job" }, { status: 500 });
  }

  await supabase
    .from("leads")
    .update({
      production_stage: nextStage,
      updated_at: new Date().toISOString(),
    })
    .eq("lead_id", job.lead_id);

  await supabase.from("job_stage_history").insert({
    job_id: job.id,
    trello_card_id: cardId,
    trello_list_id: listAfterId,
    stage: nextStage,
    from_stage: fromStage,
    to_stage: nextStage,
    moved_at: new Date().toISOString(),
    source: "trello_webhook",
  });

  return jsonOk();
}
