import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          timestamp?: string;
          text?: { body?: string };
        }>;
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
      };
    }>;
  }>;
};

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizePhone(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("27") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`;
  return `+${digits}`;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getMessageFromPayload(payload: WhatsAppWebhookPayload) {
  const msg = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  return msg || null;
}

function getPhoneNumberIdFromPayload(payload: WhatsAppWebhookPayload): string {
  return safeString(payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id);
}

function verifySignatureOrReject(request: NextRequest, rawBody: Buffer): NextResponse | null {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return null;

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!signatureHeader) return NextResponse.json({ error: "Missing signature" }, { status: 401 });

  const match = signatureHeader.match(/^sha256=(.+)$/);
  if (!match) return NextResponse.json({ error: "Invalid signature format" }, { status: 401 });

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const received = match[1];

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const ok = crypto.timingSafeEqual(expectedBuf, receivedBuf);
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  return null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!mode || !token) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBuf = Buffer.from(await request.arrayBuffer());
  const signatureError = verifySignatureOrReject(request, rawBuf);
  if (signatureError) return signatureError;

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBuf.toString("utf8")) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rbPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!rbPhoneNumberId) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const phoneNumberId = getPhoneNumberIdFromPayload(payload);
  const hasMessage = !!getMessageFromPayload(payload);
  if (!hasMessage || phoneNumberId !== rbPhoneNumberId) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const msg = getMessageFromPayload(payload);
  const from = normalizePhone(safeString(msg?.from));
  const providerMessageId = safeString(msg?.id);
  const messageType = safeString(msg?.type);
  const textBody = safeString(msg?.text?.body || "");
  const sentAt = msg?.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (!from || !providerMessageId) return NextResponse.json({ ok: true }, { status: 200 });

  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });

  const preview = textBody.slice(0, 140);

  const { data: convRow, error: convError } = await supabase
    .from("wa_conversations")
    .upsert(
      {
        phone: from,
        provider: "whatsapp",
        wa_id: safeString(payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id),
        display_name: safeString(payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name),
        last_message_at: sentAt,
        last_message_preview: preview,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    )
    .select("id, lead_id, job_id")
    .single();

  if (convError || !convRow) {
    return NextResponse.json({ error: convError?.message || "Failed to upsert conversation" }, { status: 500 });
  }

  const { error: msgInsertError } = await supabase.from("wa_messages").insert({
    conversation_id: convRow.id,
    direction: "inbound",
    text: textBody,
    status: "delivered",
    provider_message_id: providerMessageId,
    message_type: messageType,
    sent_at: sentAt,
    provider_payload: payload,
    payload,
    created_at: new Date().toISOString(),
  });

  if (msgInsertError) {
    const isDuplicate = msgInsertError.code === "23505" || msgInsertError.message.toLowerCase().includes("duplicate");
    if (!isDuplicate) {
      return NextResponse.json({ error: msgInsertError.message || "Failed to insert message" }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { data: leadMatches, error: leadError } = await supabase
    .from("leads")
    .select("id, last_activity_at, assigned_rep_id")
    .eq("phone", from)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (!leadError && Array.isArray(leadMatches) && leadMatches.length > 0) {
    const leadId = leadMatches[0].id;
    const assignedRepId = leadMatches[0].assigned_rep_id || null;

    const { data: jobMatches } = await supabase
      .from("jobs")
      .select("id")
      .eq("lead_id", leadId)
      .eq("is_active", true)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const jobId = Array.isArray(jobMatches) && jobMatches.length > 0 ? jobMatches[0].id : null;

    await supabase
      .from("wa_conversations")
      .update({
        lead_id: leadId,
        job_id: jobId,
        assigned_rep_id: assignedRepId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", convRow.id);

    await supabase
      .from("leads")
      .update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", leadId);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
