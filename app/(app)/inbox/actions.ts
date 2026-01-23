"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";

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

export async function sendMessageAction(conversationId: string, text: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // 1. Insert message
  const { error: msgError } = await supabase
    .from("wa_messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      text,
      created_by: user.id,
      status: "sent",
    });

  if (msgError) {
    return { error: msgError.message };
  }

  // 2. Update conversation last_message_at
  const { error: convError } = await supabase
    .from("wa_conversations")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (convError) {
    console.error("Error updating conversation timestamp:", convError);
  }

  revalidatePath("/inbox");
  return { success: true };
}
