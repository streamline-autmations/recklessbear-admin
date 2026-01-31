import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function assertIngestAuthorized(request: NextRequest): { ok: true } | { error: string; status: number } {
  const secret = process.env.LEADS_INGEST_SECRET;
  if (!secret) return { error: "Ingestion not configured", status: 500 };

  const header = request.headers.get("x-leads-ingest-secret");
  if (!header || header !== secret) return { error: "Unauthorized", status: 401 };

  return { ok: true };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const leadIngestSchema = z
  .object({
    lead_id: z.string().min(1),

    customer_name: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    organization: z.string().min(1).optional(),

    has_requested_quote: z.boolean().optional(),
    has_booked_call: z.boolean().optional(),
    has_asked_question: z.boolean().optional(),

    quote_data: z.unknown().optional(),
    booking_data: z.unknown().optional(),
    question_data: z.unknown().optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const auth = assertIngestAuthorized(request);
  if (!("ok" in auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const auth = assertIngestAuthorized(request);
  if (!("ok" in auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getAdminSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = leadIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
  }

  const incoming = parsed.data;
  const leadId = incoming.lead_id.trim();

  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select(
      "id, lead_id, has_requested_quote, has_booked_call, has_asked_question, quote_data, booking_data, question_data"
    )
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message || "Failed to load lead" }, { status: 500 });
  }

  const existingQuote = isPlainRecord(existing?.quote_data) ? existing?.quote_data : {};
  const existingBooking = isPlainRecord(existing?.booking_data) ? existing?.booking_data : {};
  const existingQuestion = isPlainRecord(existing?.question_data) ? existing?.question_data : {};

  const nextQuote = isPlainRecord(incoming.quote_data) ? { ...existingQuote, ...incoming.quote_data } : existing?.quote_data;
  const nextBooking = isPlainRecord(incoming.booking_data)
    ? { ...existingBooking, ...incoming.booking_data }
    : existing?.booking_data;
  const nextQuestion = isPlainRecord(incoming.question_data)
    ? { ...existingQuestion, ...incoming.question_data }
    : existing?.question_data;

  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    lead_id: leadId,
    updated_at: nowIso,
    last_modified: nowIso,
    last_modified_by: "system:lead-ingest-api",
  };

  for (const key of ["customer_name", "name", "email", "phone", "organization"] as const) {
    const value = incoming[key];
    if (typeof value === "string" && value.trim()) update[key] = value.trim();
  }

  if (incoming.has_requested_quote === true || existing?.has_requested_quote === true) update.has_requested_quote = true;
  if (incoming.has_booked_call === true || existing?.has_booked_call === true) update.has_booked_call = true;
  if (incoming.has_asked_question === true || existing?.has_asked_question === true) update.has_asked_question = true;

  if (isPlainRecord(incoming.quote_data)) update.quote_data = nextQuote;
  if (isPlainRecord(incoming.booking_data)) update.booking_data = nextBooking;
  if (isPlainRecord(incoming.question_data)) update.question_data = nextQuestion;

  const { data: upserted, error: upsertError } = await supabase
    .from("leads")
    .upsert(update, { onConflict: "lead_id", ignoreDuplicates: false })
    .select("id, lead_id, has_requested_quote, has_booked_call, has_asked_question, quote_data, booking_data, question_data")
    .single();

  if (upsertError || !upserted) {
    return NextResponse.json({ error: upsertError?.message || "Failed to upsert lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lead: upserted });
}
