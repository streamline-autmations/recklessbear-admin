-- Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- Add missing columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- Ensure status column exists (if using status instead of sales_status)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status text;

-- Copy sales_status to status if status is null and sales_status exists
-- (Only run this if you're migrating from sales_status to status)
UPDATE leads SET status = sales_status WHERE status IS NULL AND sales_status IS NOT NULL;
