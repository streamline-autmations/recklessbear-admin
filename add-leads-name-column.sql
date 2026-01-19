-- Migration: Add missing 'name' column to leads table
-- Run this in Supabase SQL Editor if your leads table is missing the 'name' column

-- Add the 'name' column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'leads' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE leads ADD COLUMN name text;
    RAISE NOTICE 'Added "name" column to leads table';
  ELSE
    RAISE NOTICE 'Column "name" already exists in leads table';
  END IF;
END $$;
