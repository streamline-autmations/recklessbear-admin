import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { extractProductListSection, LIST_ID_TO_STAGE, parseProductListSection } from "@/lib/trello";

type TrelloWebhookPayload = {
  action?: {
    type?: string;
    data?: {
      card?: { id?: string };
      listAfter?: { id?: string };
    };
  };
};

function verifyTrelloWebhookSignature(params: {
  body: string;
  callbackUrl: string;
  signature: string | null;
  secret: string;
}): boolean {
  if (!params.signature) return false;
  const base = params.callbackUrl + params.body;
  const expected = crypto.createHmac("sha1", params.secret).update(base).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const secret = process.env.TRELLO_WEBHOOK_SECRET;
  const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL;
  const signature = request.headers.get("x-trello-webhook");

  if (!secret || !callbackUrl) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const body = await request.text();
  const isValid = verifyTrelloWebhookSignature({ body, callbackUrl, signature, secret });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: TrelloWebhookPayload;
  try {
    payload = JSON.parse(body) as TrelloWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = payload?.action;
  const actionType = action?.type as string | undefined;

  if (actionType !== "updateCard") {
    return NextResponse.json({ ok: true });
  }

  const cardId = action?.data?.card?.id as string | undefined;
  const listAfterId = action?.data?.listAfter?.id as string | undefined;

  if (!cardId || !listAfterId) {
    return NextResponse.json({ ok: true });
  }

  const stage = LIST_ID_TO_STAGE[listAfterId];
  if (!stage) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, lead_id, production_stage")
    .eq("trello_card_id", cardId)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json({ error: jobError.message || "Failed to load job" }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ ok: true });
  }

  const nowIso = new Date().toISOString();

  await supabase
    .from("jobs")
    .update({
      trello_list_id: listAfterId,
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

  await supabase.from("job_stage_history").insert({
    job_id: job.id,
    stage,
    entered_at: nowIso,
  });

  if (stage === "printing") {
    const apiKey = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_TOKEN;

    if (apiKey && token) {
      const cardRes = await fetch(
        `https://api.trello.com/1/cards/${cardId}?key=${apiKey}&token=${token}&fields=desc`,
        { method: "GET" }
      );

      if (cardRes.ok) {
        const cardJson = (await cardRes.json()) as { desc?: string };
        const desc = cardJson.desc || "";
        const section = extractProductListSection(desc);
        if (section) {
          const items = parseProductListSection(section);
          if (items.length > 0) {
            await supabase.rpc("deduct_stock_for_job", {
              p_job_id: job.id,
              p_items: items,
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
