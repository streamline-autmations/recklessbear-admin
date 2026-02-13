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
      phone,
      lead_id,
      assigned_rep_id,
      last_message_at,
      unread_count,
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

  return (data || []).slice(0, 150) as unknown as WhatsAppConversation[];
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

  // 1. Insert message
  const { error: msgError } = await supabase
    .from("wa_messages")
    .insert({
      id: messageId,
      conversation_id: conversationId,
      direction: "outbound",
      text,
      created_by: user.id,
      status: "sent",
    });

  if (msgError) {
    if (msgError.code === "23505") {
      return { success: true };
    }
    return { error: msgError.message };
  }

  // 2. Update conversation last_message_at
  const { error: convError } = await supabase
    .from("wa_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (convError) {
    console.error("Error updating conversation timestamp:", convError);
  }

  revalidatePath("/inbox");
  return { success: true };
}
