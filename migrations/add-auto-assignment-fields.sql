-- Migration: Add auto-assignment fields to leads table
-- Adds fields for tracking assignment timestamps and alert status

-- Add assigned_at timestamp
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Add rep_alert_sent boolean (default false, not null)
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS rep_alert_sent boolean DEFAULT false NOT NULL;

-- Add rep_alert_sent_at timestamp
ALTER TABLE leads 
  ADD COLUMN IF NOT EXISTS rep_alert_sent_at timestamptz;

-- Add comments for documentation
COMMENT ON COLUMN leads.assigned_at IS 'Timestamp when lead was assigned to a rep';
COMMENT ON COLUMN leads.rep_alert_sent IS 'Whether rep has been notified about assignment';
COMMENT ON COLUMN leads.rep_alert_sent_at IS 'Timestamp when rep alert was sent';
