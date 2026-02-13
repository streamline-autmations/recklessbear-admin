DROP POLICY IF EXISTS "Reps can update assigned conversations" ON wa_conversations;

CREATE POLICY "Reps can update assigned conversations"
  ON wa_conversations
  FOR UPDATE
  USING (
    assigned_rep_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = wa_conversations.lead_id
      AND leads.assigned_rep_id = auth.uid()
    )
  )
  WITH CHECK (
    assigned_rep_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = wa_conversations.lead_id
      AND leads.assigned_rep_id = auth.uid()
    )
  );
