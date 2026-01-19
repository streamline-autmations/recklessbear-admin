-- Fix for infinite recursion in profiles RLS policies
-- Run this in Supabase SQL Editor to fix the recursion issue

-- Step 1: Drop existing problematic policies
DROP POLICY IF EXISTS "CEO/Admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "CEO/Admin can update all profiles" ON profiles;

-- Step 2: Create a SECURITY DEFINER function to check user role without RLS recursion
-- This function runs with the privileges of the function owner, bypassing RLS
CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE profiles.user_id = check_user_id;
$$;

-- Step 3: Recreate policies using the function (which bypasses RLS due to SECURITY DEFINER)
CREATE POLICY "CEO/Admin can view all profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "CEO/Admin can update all profiles"
  ON profiles FOR UPDATE
  USING (
    auth.uid() = user_id
    OR public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

-- Step 4: Also fix leads policies to use the same helper function to avoid similar issues
-- Drop and recreate leads policies that check profiles

DROP POLICY IF EXISTS "CEO/Admin can view all leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can insert leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can update leads" ON leads;
DROP POLICY IF EXISTS "CEO/Admin can delete leads" ON leads;
DROP POLICY IF EXISTS "Rep can view assigned leads" ON leads;
DROP POLICY IF EXISTS "Rep can update assigned leads" ON leads;

-- Recreate with helper function
CREATE POLICY "CEO/Admin can view all leads"
  ON leads FOR SELECT
  USING (
    public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "CEO/Admin can insert leads"
  ON leads FOR INSERT
  WITH CHECK (
    public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "CEO/Admin can update leads"
  ON leads FOR UPDATE
  USING (
    public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "CEO/Admin can delete leads"
  ON leads FOR DELETE
  USING (
    public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "Rep can view assigned leads"
  ON leads FOR SELECT
  USING (
    assigned_rep_id = auth.uid()
    OR public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );

CREATE POLICY "Rep can update assigned leads"
  ON leads FOR UPDATE
  USING (
    assigned_rep_id = auth.uid()
    OR public.get_user_role(auth.uid()) IN ('ceo', 'admin')
  );
