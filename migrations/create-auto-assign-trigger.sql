-- Migration: Auto-assign leads on INSERT
-- This trigger ensures all new leads are automatically assigned to a rep immediately

CREATE OR REPLACE FUNCTION public.auto_assign_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rep_id uuid;
  v_active_count bigint;
BEGIN
  -- Only auto-assign if assigned_rep_id is NULL
  IF NEW.assigned_rep_id IS NULL THEN
    -- Find rep with least active leads (status != 'Contacted')
    -- Same logic as assign_lead_auto but without auth checks (runs in trigger context)
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
    
    -- If rep found, assign the lead
    IF v_rep_id IS NOT NULL THEN
      NEW.assigned_rep_id := v_rep_id;
      NEW.assigned_at := NOW();
      NEW.last_modified := NOW();
      NEW.last_modified_by := 'system:auto-assign';
      NEW.updated_at := NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger that fires BEFORE INSERT
CREATE TRIGGER trigger_auto_assign_new_lead
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  WHEN (NEW.assigned_rep_id IS NULL)
  EXECUTE FUNCTION public.auto_assign_new_lead();

-- Add comment
COMMENT ON FUNCTION public.auto_assign_new_lead() IS 'Automatically assigns new leads to reps when inserted without an assigned_rep_id. Runs before INSERT, so assignment happens immediately.';
