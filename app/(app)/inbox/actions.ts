"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";

export async function getConversations(): Promise<WhatsAppConversation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wa_conversations")
    .select(`
      id,
      provider,
      wa_id,
      display_name,
      custom_display_name,
      phone,
      lead_id,
      assigned_rep_id,
      last_message_at,
      last_message_preview,
      unread_count,
      lead:leads (
        id,
        name,
        organization
      )
    `)
    .order("last_message_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("Error fetching conversations:", error);
    return [];
  }

  return (data || []) as unknown as WhatsAppConversation[];
}

export async function getMessages(conversationId: string): Promise<WhatsAppMessage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wa_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("Error fetching messages:", error);
    return [];
  }

  return (data as WhatsAppMessage[]).reverse();
}

export async function markConversationRead(conversationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("wa_conversations")
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/inbox");
  return { success: true };
}

export async function sendMessageAction(conversationId: string, messageId: string, text: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
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

  const { data: conversation, error: convGetError } = await supabase
    .from("wa_conversations")
    .select("id, phone, lead_id")
    .eq("id", conversationId)
    .single();

  if (convGetError || !conversation) {
    return { error: "Conversation not found" };
  }

  const targetPhone = normalizePhone((conversation as { phone: string }).phone);
  if (!targetPhone) {
    return { error: "Invalid conversation phone" };
  }

  const nowIso = new Date().toISOString();
  const preview = text.slice(0, 140);

  const { error: msgError } = await supabase
    .from("wa_messages")
    .insert({
      id: messageId,
      conversation_id: conversationId,
      direction: "outbound",
      text,
      created_by: user.id,
      status: "queued",
      to_phone: targetPhone,
      sent_at: null,
      delivered_at: null,
      retry_count: 0,
    });

  if (msgError) {
    if (msgError.code === "23505") {
      return { success: true };
    }
    return { error: msgError.message };
  }

  const { error: convError } = await supabase
    .from("wa_conversations")
    .update({
      last_message_at: nowIso,
      last_message_preview: preview,
      updated_at: nowIso,
    })
    .eq("id", conversationId);

  if (convError) {
    console.error("Error updating conversation timestamp:", convError);
  }

  const webhookUrl = process.env.WA_OUTBOUND_WEBHOOK_URL || "https://dockerfile-1n82.onrender.com/webhook/wa/send";
  if (webhookUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message_id: messageId,
          to_phone: targetPhone,
          text,
          created_by: user.id,
          created_at: nowIso,
        }),
        signal: controller.signal,
      });

      if (webhookRes.ok) {
        await supabase
          .from("wa_messages")
          .update({
            status: "sending",
            provider_payload: {
              webhook_dispatched: true,
              webhook_url: webhookUrl,
              webhook_dispatched_at: new Date().toISOString(),
            },
          })
          .eq("id", messageId);
      } else {
        const bodyText = await webhookRes.text().catch(() => "");
        await supabase
          .from("wa_messages")
          .update({
            error: `Webhook ${webhookRes.status}: ${bodyText}`.slice(0, 1000),
          })
          .eq("id", messageId);
      }
    } catch (e) {
      await supabase
        .from("wa_messages")
        .update({
          error: `Webhook dispatch failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 1000),
        })
        .eq("id", messageId);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  revalidatePath("/inbox");
  return { success: true };
}
