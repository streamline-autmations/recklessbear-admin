export interface WhatsAppConversation {
  id: string;
  phone: string;
  lead_id: string | null;
  assigned_rep_id: string | null;
  last_message_at: string;
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
  status: "queued" | "sending" | "simulated_sent" | "sent" | "delivered" | "read" | "failed";
  created_at: string;
  created_by: string | null;
}
