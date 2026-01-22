-- Migration: Normalize Lead Intents
-- This migration ensures lead intent flags are stable and properly backfilled
-- Rules: Only upgrade false->true, never overwrite true->false

-- Step 1: Set defaults to false (for new rows)
ALTER TABLE leads 
  ALTER COLUMN has_requested_quote SET DEFAULT false,
  ALTER COLUMN has_booked_call SET DEFAULT false,
  ALTER COLUMN has_asked_question SET DEFAULT false;

-- Step 2: Backfill nulls to false
UPDATE leads 
SET 
  has_requested_quote = COALESCE(has_requested_quote, false),
  has_booked_call = COALESCE(has_booked_call, false),
  has_asked_question = COALESCE(has_asked_question, false)
WHERE 
  has_requested_quote IS NULL 
  OR has_booked_call IS NULL 
  OR has_asked_question IS NULL;

-- Step 3: One-time backfill based on evidence
-- Only upgrade false->true, never overwrite true->false

-- Quote evidence (strong):
-- quote_data not null OR attachments not null OR category/product_type not null 
-- OR quantity_range not null OR has_deadline true OR include_warmups true 
-- OR design_notes/message not null OR trello_product_list not null OR delivery_date not null
UPDATE leads
SET has_requested_quote = true
WHERE has_requested_quote = false
  AND (
    quote_data IS NOT NULL
    OR attachments IS NOT NULL
    OR category IS NOT NULL
    OR product_type IS NOT NULL
    OR quantity_range IS NOT NULL
    OR (has_deadline IS NOT NULL AND has_deadline::text != 'false' AND has_deadline::text != '')
    OR (include_warmups IS NOT NULL AND include_warmups::text != 'false' AND include_warmups::text != '')
    OR design_notes IS NOT NULL
    OR message IS NOT NULL
    OR trello_product_list IS NOT NULL
    OR delivery_date IS NOT NULL
  );

-- Booking evidence (strong):
-- booking_time not null OR booking_approved true OR booking_data not null OR pre_call_notes not null
UPDATE leads
SET has_booked_call = true
WHERE has_booked_call = false
  AND (
    booking_time IS NOT NULL
    OR (booking_approved IS NOT NULL AND booking_approved::text != 'false' AND booking_approved::text != '')
    OR booking_data IS NOT NULL
    OR pre_call_notes IS NOT NULL
  );

-- Question evidence (strong):
-- question not null OR question_data not null
UPDATE leads
SET has_asked_question = true
WHERE has_asked_question = false
  AND (
    question IS NOT NULL
    OR question_data IS NOT NULL
  );

-- Step 4: Map legacy lead_type text to intents (only upgrade false->true)
-- Quote keywords
UPDATE leads
SET has_requested_quote = true
WHERE has_requested_quote = false
  AND lead_type IS NOT NULL
  AND (
    LOWER(lead_type) LIKE '%quote%'
    OR LOWER(lead_type) LIKE '%quotation%'
    OR LOWER(lead_type) LIKE '%quote request%'
  );

-- Booking keywords
UPDATE leads
SET has_booked_call = true
WHERE has_booked_call = false
  AND lead_type IS NOT NULL
  AND (
    LOWER(lead_type) LIKE '%booking%'
    OR LOWER(lead_type) LIKE '%book a call%'
    OR LOWER(lead_type) LIKE '%call%'
    OR LOWER(lead_type) LIKE '%schedule%'
  );

-- Question keywords
UPDATE leads
SET has_asked_question = true
WHERE has_asked_question = false
  AND lead_type IS NOT NULL
  AND (
    LOWER(lead_type) LIKE '%question%'
    OR LOWER(lead_type) LIKE '%ask%'
    OR LOWER(lead_type) LIKE '%inquiry%'
    OR LOWER(lead_type) LIKE '%enquiry%'
  );

-- Step 5: Add NOT NULL constraints (after backfill is complete)
-- Note: Run this after verifying the backfill worked correctly
-- ALTER TABLE leads 
--   ALTER COLUMN has_requested_quote SET NOT NULL,
--   ALTER COLUMN has_booked_call SET NOT NULL,
--   ALTER COLUMN has_asked_question SET NOT NULL;
