-- Trello sync support:
-- - Store Trello list ID on jobs
-- - Track stage transitions
-- - Track customer alerts idempotently

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS trello_list_id TEXT;

ALTER TABLE jobs
  ALTER COLUMN production_stage SET DEFAULT 'Orders Awaiting Confirmation';

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_lead_id_unique ON jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_trello_list_id ON jobs(trello_list_id);

CREATE TABLE IF NOT EXISTS job_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trello_card_id TEXT,
  trello_list_id TEXT,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'trello_webhook',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS trello_card_id TEXT;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS trello_list_id TEXT;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS from_stage TEXT;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS to_stage TEXT;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE job_stage_history
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE job_stage_history
  ALTER COLUMN moved_at SET DEFAULT NOW();
ALTER TABLE job_stage_history
  ALTER COLUMN source SET DEFAULT 'trello_webhook';
ALTER TABLE job_stage_history
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE job_stage_history
SET
  moved_at = COALESCE(moved_at, created_at, NOW()),
  created_at = COALESCE(created_at, moved_at, NOW()),
  source = COALESCE(NULLIF(source, ''), 'trello_webhook')
WHERE
  moved_at IS NULL
  OR created_at IS NULL
  OR source IS NULL
  OR source = '';

ALTER TABLE job_stage_history
  ALTER COLUMN moved_at SET NOT NULL;
ALTER TABLE job_stage_history
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE job_stage_history
  ALTER COLUMN source SET NOT NULL;

ALTER TABLE job_stage_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Allow read access to authenticated users" ON job_stage_history
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Allow insert access to authenticated users" ON job_stage_history
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_stage_history_job_id ON job_stage_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_stage_history_moved_at ON job_stage_history(moved_at);

CREATE TABLE IF NOT EXISTS job_customer_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  channel TEXT NOT NULL,
  message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_customer_alerts
  ADD COLUMN IF NOT EXISTS stage TEXT;
ALTER TABLE job_customer_alerts
  ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE job_customer_alerts
  ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE job_customer_alerts
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE job_customer_alerts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE job_customer_alerts
  ALTER COLUMN sent_at SET DEFAULT NOW();
ALTER TABLE job_customer_alerts
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE job_customer_alerts
SET
  sent_at = COALESCE(sent_at, NOW()),
  created_at = COALESCE(created_at, sent_at, NOW())
WHERE
  sent_at IS NULL
  OR created_at IS NULL;

ALTER TABLE job_customer_alerts
  ALTER COLUMN sent_at SET NOT NULL;
ALTER TABLE job_customer_alerts
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE job_customer_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Allow read access to authenticated users" ON job_customer_alerts
    FOR SELECT TO authenticated USING (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Allow insert access to authenticated users" ON job_customer_alerts
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS job_customer_alerts_unique ON job_customer_alerts(job_id, stage, channel);
CREATE INDEX IF NOT EXISTS idx_job_customer_alerts_job_id ON job_customer_alerts(job_id);
