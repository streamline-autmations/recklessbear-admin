-- Add optional JSONB columns to leads table for structured request data
-- These columns are nullable and only used if the application needs to store
-- structured question, quote, or booking request data

ALTER TABLE leads ADD COLUMN IF NOT EXISTS question_data jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_data jsonb;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_data jsonb;

-- Optional: Add comments to document the columns
COMMENT ON COLUMN leads.question_data IS 'Structured data for question-type leads';
COMMENT ON COLUMN leads.quote_data IS 'Structured data for quote request leads';
COMMENT ON COLUMN leads.booking_data IS 'Structured data for booking request leads';
