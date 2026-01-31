DO $$
DECLARE
  v_fk_name text;
BEGIN
  SELECT c.conname
  INTO v_fk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'jobs'
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES%leads(lead_id)%';

  IF v_fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', v_fk_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_lead_id_fkey'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_lead_id_fkey
      FOREIGN KEY (lead_id)
      REFERENCES public.leads(id)
      ON DELETE CASCADE;
  END IF;
END $$;

