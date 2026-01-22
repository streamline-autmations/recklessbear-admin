-- Migration: Create RPC function for auto-assigning leads
-- Function assigns leads to reps with least active leads (status != 'Contacted')

CREATE OR REPLACE FUNCTION public.assign_lead_auto(p_lead_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_user_role text;
  v_lead_id uuid;
  v_assigned_rep_id uuid;
  v_rep_id uuid;
  v_active_count bigint;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check if user is CEO or Admin
  SELECT role INTO v_user_role
  FROM profiles
  WHERE user_id = v_user_id;
  
  IF v_user_role NOT IN ('ceo', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only CEO/Admin can auto-assign leads';
  END IF;
  
  -- Convert lead_id text to UUID (assuming leads.id is UUID)
  -- First try to find by lead_id (text field)
  SELECT id INTO v_lead_id
  FROM leads
  WHERE lead_id = p_lead_id
  FOR UPDATE;
  
  -- If not found by lead_id, try as UUID directly
  IF v_lead_id IS NULL THEN
    BEGIN
      v_lead_id := p_lead_id::uuid;
      SELECT id INTO v_lead_id
      FROM leads
      WHERE id = v_lead_id
      FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Lead not found: %', p_lead_id;
    END;
  END IF;
  
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;
  
  -- Check if already assigned
  SELECT assigned_rep_id INTO v_assigned_rep_id
  FROM leads
  WHERE id = v_lead_id;
  
  IF v_assigned_rep_id IS NOT NULL THEN
    RETURN v_assigned_rep_id;
  END IF;
  
  -- Find rep with least active leads (status != 'Contacted')
  -- Tie-break by profiles.created_at asc (oldest rep first)
  SELECT 
    p.user_id,
    COUNT(l.id) as active_count
  INTO v_rep_id, v_active_count
  FROM profiles p
  LEFT JOIN leads l ON l.assigned_rep_id = p.user_id 
    AND l.status IS DISTINCT FROM 'Contacted'
  WHERE p.role = 'rep'
  GROUP BY p.user_id, p.created_at
  ORDER BY active_count ASC, p.created_at ASC
  LIMIT 1;
  
  IF v_rep_id IS NULL THEN
    RAISE EXCEPTION 'No rep available for assignment';
  END IF;
  
  -- Update lead with assignment
  UPDATE leads
  SET 
    assigned_rep_id = v_rep_id,
    assigned_at = NOW(),
    last_modified = NOW(),
    last_modified_by = 'system:auto-assign',
    updated_at = NOW()
  WHERE id = v_lead_id;
  
  RETURN v_rep_id;
END;
$$;

-- Revoke public execute, grant to authenticated users
REVOKE EXECUTE ON FUNCTION public.assign_lead_auto(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_lead_auto(text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.assign_lead_auto(text) IS 'Auto-assigns a lead to the rep with least active leads (status != Contacted). Only callable by CEO/Admin.';
