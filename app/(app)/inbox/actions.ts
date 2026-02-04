"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function getConversations(): Promise<WhatsAppConversation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wa_conversations")
    .select(`
      *,
      lead:leads (
        id,
        name,
        organization
      )
    `)
    .order("last_message_at", { ascending: false });

  if (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }

  return data as unknown as WhatsAppConversation[];
}

export async function getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return data as WhatsAppMessage[];
}

export async function updateCustomDisplayNameAction(conversationId: string, customDisplayName: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" } as const;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, user_id")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile?.role) return { error: "Profile not found" } as const;

  const role = profile.role as string;

  const normalized = String(customDisplayName ?? "").trim();
  const value = normalized ? normalized : null;
  const nowIso = new Date().toISOString();

  if (role === "admin" || role === "ceo") {
    const { error: updateError } = await supabase
      .from("wa_conversations")
      .update({ custom_display_name: value, updated_at: nowIso })
      .eq("id", conversationId);

    if (updateError) return { error: updateError.message || "Failed to update custom display name" } as const;

    revalidatePath("/inbox");
    return { success: true, custom_display_name: value } as const;
  }

  if (role !== "rep") return { error: "Unauthorized" } as const;

  const admin = getAdminSupabase();
  if (!admin) return { error: "Supabase admin not configured" } as const;

  const { data: conversation, error: convError } = await admin
    .from("wa_conversations")
    .select("id, lead_id, assigned_rep_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return { error: "Conversation not found" } as const;

  const assignedRepId = (conversation as { assigned_rep_id: string | null }).assigned_rep_id;
  if (assignedRepId !== user.id) {
    const leadId = (conversation as { lead_id: string | null }).lead_id;
    if (!leadId) return { error: "Unauthorized" } as const;

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("assigned_rep_id")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) return { error: "Unauthorized" } as const;
    const leadAssignedRepId = (lead as { assigned_rep_id: string | null }).assigned_rep_id;
    if (leadAssignedRepId !== user.id) return { error: "Unauthorized" } as const;
  }

  const { error: updateError } = await admin
    .from("wa_conversations")
    .update({ custom_display_name: value, updated_at: nowIso })
    .eq("id", conversationId);

  if (updateError) return { error: updateError.message || "Failed to update custom display name" } as const;

  revalidatePath("/inbox");
  return { success: true, custom_display_name: value } as const;
}

export async function sendMessageAction(conversationId: string, text: string, clientTempId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const nowIso = new Date().toISOString();
  const preview = text.slice(0, 140);

  const webhookUrl =
    process.env.WHATSAPP_SEND_WEBHOOK_URL ||
    process.env.NEXT_PUBLIC_WHATSAPP_SEND_WEBHOOK_URL ||
    "https://dockerfile-1n82.onrender.com/webhook/wa/send";

  const finalClientTempId = String(clientTempId || "").trim() || `tmp_${Date.now()}`;

  const getStringField = (value: unknown, field: string) => {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const v = record[field];
    return typeof v === "string" ? v : null;
  };

  let webhookJson: unknown = null;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        text,
        message_type: "text",
        created_by: user.id,
        client_temp_id: finalClientTempId,
      }),
    });

    const rawBody = await res.text();
    const trimmed = rawBody.trim();
    if (!trimmed) {
      webhookJson = null;
    } else {
      try {
        webhookJson = JSON.parse(trimmed) as unknown;
      } catch {
        webhookJson = rawBody;
      }
    }

    if (!res.ok) {
      const msg =
        getStringField(webhookJson, "message") ||
        getStringField(webhookJson, "error") ||
        `Webhook request failed (${res.status})`;
      return { error: msg };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to call webhook";
    return { error: msg };
  }

  const { error: insertError } = await supabase.from("wa_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    text,
    status: "queued",
    created_at: nowIso,
    created_by: user.id,
    retry_count: 0,
  });

  if (insertError) return { error: insertError.message || "Failed to queue message" };

  const admin = getAdminSupabase();
  if (admin) {
    await admin
      .from("wa_conversations")
      .update({ last_message_at: nowIso, last_message_preview: preview, updated_at: nowIso })
      .eq("id", conversationId);
  }

  revalidatePath("/inbox");
  return { success: true };
}
