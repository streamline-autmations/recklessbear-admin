-- RecklessBear Admin v1 - Database Schema + RLS (Airtable Mirror)
-- Paste this entire script into Supabase SQL Editor

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL CHECK (role IN ('ceo', 'admin', 'rep')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "CEO/Admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "CEO/Admin can update all profiles" ON profiles;

-- RLS: Users can select/update their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS: CEO/Admin can select/update all profiles
-- Note: These policies will be fixed by fix-rls-recursion.sql to avoid infinite recursion
CREATE POLICY "CEO/Admin can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "CEO/Admin can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

-- ============================================================================
-- 2. LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text UNIQUE NOT NULL,
  name text,
  organization text,
  email text,
  phone text,
  submission_date timestamptz DEFAULT now(),
  assigned_rep_id uuid REFERENCES auth.users(id),
  sales_status text NOT NULL DEFAULT 'New' CHECK (sales_status IN ('New', 'Assigned', 'Contacted', 'Quote Sent', 'Quote Approved')),
  production_stage text,
  trello_card_id text,
  payment_status text,
  invoice_number text,
  -- Flags (all boolean default false)
  alert_sent boolean DEFAULT false,
  whatsapp_alert boolean DEFAULT false,
  followups boolean DEFAULT false,
  ceo_alerts boolean DEFAULT false,
  card_created boolean DEFAULT false,
  stock_updated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "CEO/Admin can view all leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can insert leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can update leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can delete leads" ON leads;
DROP POLICY IF EXISTS "Rep can view assigned leads" ON leads;
DROP POLICY IF EXISTS "Rep can update assigned leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON leads;

-- RLS: CEO/Admin full access
CREATE POLICY "CEO/Admin can view all leads"
  ON leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "CEO/Admin can insert leads"
  ON leads FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "CEO/Admin can update leads"
  ON leads FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "CEO/Admin can delete leads"
  ON leads FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

-- RLS: Rep can select/update only assigned leads
CREATE POLICY "Rep can view assigned leads"
  ON leads FOR SELECT
  USING (
    assigned_rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

CREATE POLICY "Rep can update assigned leads"
  ON leads FOR UPDATE
  USING (
    assigned_rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
  );

-- RLS: Authenticated users can insert (for n8n/service role inserts)
CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- 3. LEAD_EVENTS TABLE (Audit Trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view events for accessible leads" ON lead_events;
DROP POLICY IF EXISTS "Users can insert events for accessible leads" ON lead_events;

-- RLS: Same access as related lead
CREATE POLICY "Users can view events for accessible leads"
  ON lead_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_events.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert events for accessible leads"
  ON lead_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_events.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
    AND actor_user_id = auth.uid()
  );

-- ============================================================================
-- 4. LEAD_NOTES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES auth.users(id),
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view notes for accessible leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can insert notes for accessible leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can update notes for accessible leads" ON lead_notes;
DROP POLICY IF EXISTS "Users can delete notes for accessible leads" ON lead_notes;

-- RLS: Same access as related lead
CREATE POLICY "Users can view notes for accessible leads"
  ON lead_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_notes.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert notes for accessible leads"
  ON lead_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_notes.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
    AND author_user_id = auth.uid()
  );

CREATE POLICY "Users can update notes for accessible leads"
  ON lead_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_notes.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete notes for accessible leads"
  ON lead_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM leads
      WHERE leads.id = lead_notes.lead_id
      AND (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE user_id = auth.uid()
          AND role IN ('ceo', 'admin')
        )
        OR leads.assigned_rep_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 5. WA_MESSAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  to_phone text,
  from_phone text,
  body text,
  meta_message_id text UNIQUE,
  status text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view messages for accessible leads" ON wa_messages;
DROP POLICY IF EXISTS "Users can insert messages for accessible leads" ON wa_messages;

-- RLS: Same access as related lead
CREATE POLICY "Users can view messages for accessible leads"
  ON wa_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = wa_messages.lead_id
        AND leads.assigned_rep_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert messages for accessible leads"
  ON wa_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('ceo', 'admin')
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM leads
        WHERE leads.id = wa_messages.lead_id
        AND leads.assigned_rep_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 6. UPDATED_AT TRIGGER FOR LEADS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. INDEXES
-- ============================================================================

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_sales_status ON leads(sales_status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep_id ON leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_leads_submission_date ON leads(submission_date);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Lead events indexes
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at);

-- Lead notes indexes
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at);

-- WA messages indexes
CREATE INDEX IF NOT EXISTS idx_wa_messages_meta_message_id ON wa_messages(meta_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lead_id ON wa_messages(lead_id);

-- ============================================================================
-- SEED PROFILES EXAMPLE
-- ============================================================================
-- After a user signs up via Supabase Auth, insert their profile:
-- 
-- INSERT INTO profiles (user_id, full_name, role)
-- VALUES (
--   'USER_UUID_FROM_AUTH_USERS',  -- Replace with actual auth.users.id
--   'John Doe',
--   'admin'  -- or 'ceo' or 'rep'
-- );
--
-- To find the user_id:
-- SELECT id, email FROM auth.users;
