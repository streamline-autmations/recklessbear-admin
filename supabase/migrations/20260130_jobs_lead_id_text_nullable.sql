DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jobs'
      AND column_name = 'lead_id_text'
  ) THEN
    ALTER TABLE public.jobs ALTER COLUMN lead_id_text DROP NOT NULL;

    UPDATE public.jobs j
    SET lead_id_text = l.lead_id
    FROM public.leads l
    WHERE j.lead_id = l.id
      AND j.lead_id_text IS NULL;
  END IF;
END $$;

