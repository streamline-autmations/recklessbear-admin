export interface WhatsAppConversation {
  id: string;
  provider?: string | null;
  wa_id?: string | null;
  display_name?: string | null;
  custom_display_name?: string | null;
  phone: string;
  lead_id: string | null;
  assigned_rep_id: string | null;
  last_message_at: string;
  last_message_preview?: string | null;
  unread_count: number;
  lead?: {
    id: string;
    name: string;
    organization: string | null;
  } | null;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  text: string;
  status: "sent" | "delivered" | "read" | "failed";
  created_at: string;
  created_by: string | null;
}
