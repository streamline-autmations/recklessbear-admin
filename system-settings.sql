CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS " Admin can view settings\ ON system_settings;
DROP POLICY IF EXISTS \Admin can modify settings\ ON system_settings;

CREATE POLICY \Admin can view settings\
 ON system_settings FOR SELECT
 USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));

CREATE POLICY \Admin can modify settings\
 ON system_settings FOR ALL
 USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'))
 WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));
