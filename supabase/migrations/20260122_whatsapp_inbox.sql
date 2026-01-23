-- Drop existing tables to ensure clean slate matching new spec
DROP TABLE IF EXISTS wa_messages;
DROP TABLE IF EXISTS wa_conversations;

-- Create WhatsApp Conversations table
CREATE TABLE IF NOT EXISTS wa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create WhatsApp Messages table
CREATE TABLE IF NOT EXISTS wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  text TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'sent', -- sent, delivered, read, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL -- For outbound messages sent by users
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead_id ON wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_assigned_rep_id ON wa_conversations(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation_id ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_created_at ON wa_messages(created_at DESC);

-- Enable RLS
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;

-- Policies for wa_conversations

-- CEO/Admin can view all
CREATE POLICY "CEO/Admin can view all conversations"
  ON wa_conversations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('ceo', 'admin')
    )
  );

-- Reps can view assigned conversations OR conversations linked to their leads
CREATE POLICY "Reps can view assigned conversations"
  ON wa_conversations
  FOR SELECT
  USING (
    assigned_rep_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = wa_conversations.lead_id
      AND leads.assigned_rep_id = auth.uid()
    )
  );

-- Policies for wa_messages

-- Inherit access from conversation
CREATE POLICY "Users can view messages if they can view conversation"
  ON wa_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM wa_conversations
      WHERE wa_conversations.id = wa_messages.conversation_id
      AND (
        -- Admin/CEO check
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role IN ('ceo', 'admin')
        )
        OR
        -- Rep check
        wa_conversations.assigned_rep_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM leads
            WHERE leads.id = wa_conversations.lead_id
            AND leads.assigned_rep_id = auth.uid()
        )
      )
    )
  );
