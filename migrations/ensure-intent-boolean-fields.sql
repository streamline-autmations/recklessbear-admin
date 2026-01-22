-- Migration: Ensure intent boolean fields exist on leads table
-- These fields are the source of truth for lead intents (Quote, Booking, Question)

-- Add boolean fields if they don't exist
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_requested_quote boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_booked_call boolean DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_asked_question boolean DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN leads.has_requested_quote IS 'True if lead has requested a quote. One of three canonical intent flags.';
COMMENT ON COLUMN leads.has_booked_call IS 'True if lead has booked a call. One of three canonical intent flags.';
COMMENT ON COLUMN leads.has_asked_question IS 'True if lead has asked a question. One of three canonical intent flags.';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_has_requested_quote ON leads(has_requested_quote) WHERE has_requested_quote = true;
CREATE INDEX IF NOT EXISTS idx_leads_has_booked_call ON leads(has_booked_call) WHERE has_booked_call = true;
CREATE INDEX IF NOT EXISTS idx_leads_has_asked_question ON leads(has_asked_question) WHERE has_asked_question = true;
