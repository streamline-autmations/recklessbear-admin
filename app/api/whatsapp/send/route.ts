import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 });

  const { conversationId, text } = parsed.data;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, user_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.role) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const role = profile.role as string;

  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: "Supabase admin not configured" }, { status: 500 });

  const { data: conversation, error: convError } = await admin
    .from("wa_conversations")
    .select("id, phone, lead_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const targetPhone = normalizePhone(conversation.phone);
  if (!targetPhone) return NextResponse.json({ error: "Invalid conversation phone" }, { status: 400 });

  const { data: ceoProfiles } = await admin.from("profiles").select("phone").eq("role", "ceo");
  const ceoPhones = ((ceoProfiles || []) as Array<{ phone: string | null }>)
    .map((p) => normalizePhone(p.phone || ""))
    .filter(Boolean);

  if (ceoPhones.includes(targetPhone)) {
    return NextResponse.json({ error: "Blocked recipient" }, { status: 403 });
  }

  if (role === "rep") {
    if (!conversation.lead_id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("assigned_rep_id")
      .eq("id", conversation.lead_id)
      .single();

    if (leadError || !lead) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    const assignedRepId = (lead as { assigned_rep_id: string | null }).assigned_rep_id;
    if (assignedRepId !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const preview = text.slice(0, 140);

  const { data: inserted, error: insertError } = await admin
    .from("wa_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      text,
      status: "queued",
      created_at: nowIso,
      created_by: user.id,
      to_phone: targetPhone,
      sent_at: null,
      delivered_at: null,
      retry_count: 0,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message || "Failed to queue message" }, { status: 500 });

  await admin
    .from("wa_conversations")
    .update({ last_message_at: nowIso, last_message_preview: preview, updated_at: nowIso })
    .eq("id", conversationId);

  return NextResponse.json({ ok: true, id: inserted?.id }, { status: 200 });
}
