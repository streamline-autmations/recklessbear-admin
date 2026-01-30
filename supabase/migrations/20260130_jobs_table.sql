-- Create jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id TEXT NOT NULL REFERENCES leads(lead_id), -- References the human-readable ID
  trello_card_id TEXT,
  trello_card_url TEXT,
  production_stage TEXT DEFAULT 'orders_awaiting_confirmation',
  invoice_number TEXT,
  payment_status TEXT DEFAULT 'Pending',
  order_deadline TIMESTAMPTZ,
  order_quantity NUMERIC,
  product_list JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Policies for jobs
CREATE POLICY "Allow read access to authenticated users" ON jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON jobs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow update access to authenticated users" ON jobs
  FOR UPDATE TO authenticated USING (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_production_stage ON jobs(production_stage);
CREATE INDEX IF NOT EXISTS idx_jobs_trello_card_id ON jobs(trello_card_id);

-- Add trigger for updated_at
CREATE TRIGGER update_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
