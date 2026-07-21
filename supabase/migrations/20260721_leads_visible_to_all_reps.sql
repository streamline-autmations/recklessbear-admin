-- Make all leads visible to every rep, not just the rep they're assigned to.
-- assigned_rep_id is kept (still used for auto-assignment / WhatsApp routing),
-- it just no longer restricts who can SEE a lead.

DROP POLICY IF EXISTS "Rep can view assigned leads" ON leads;

CREATE POLICY "Rep can view all leads"
  ON leads FOR SELECT
  USING (
    public.get_user_role(auth.uid()) IN ('rep', 'ceo', 'admin')
  );
