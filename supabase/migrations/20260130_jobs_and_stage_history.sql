-- 1️⃣ Supabase — Jobs + Stage History (aligned, idempotent)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  trello_card_id text,
  trello_list_id text,
  production_stage text,
  sales_status text,
  payment_status text,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS trello_card_id text,
  ADD COLUMN IF NOT EXISTS trello_list_id text,
  ADD COLUMN IF NOT EXISTS production_stage text,
  ADD COLUMN IF NOT EXISTS sales_status text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  lead_id_data_type text;
  legacy_fk_name text;
BEGIN
  SELECT data_type INTO lead_id_data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'jobs'
    AND column_name = 'lead_id';

  IF lead_id_data_type = 'text' THEN
    SELECT conname INTO legacy_fk_name
    FROM pg_constraint
    WHERE conrelid = 'public.jobs'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%REFERENCES public.leads(lead_id)%'
    LIMIT 1;

    IF legacy_fk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT %I', legacy_fk_name);
    END IF;

    ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS lead_id_uuid uuid;

    UPDATE public.jobs j
    SET lead_id_uuid = l.id
    FROM public.leads l
    WHERE l.lead_id = j.lead_id
      AND j.lead_id_uuid IS NULL;

    ALTER TABLE public.jobs RENAME COLUMN lead_id TO lead_id_text;
    ALTER TABLE public.jobs RENAME COLUMN lead_id_uuid TO lead_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.jobs
      WHERE lead_id IS NULL
    ) THEN
      ALTER TABLE public.jobs ALTER COLUMN lead_id SET NOT NULL;
    END IF;
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_jobs_updated_at'
  ) THEN
    CREATE TRIGGER set_jobs_updated_at
      BEFORE UPDATE ON public.jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_trello_card_id_unique
  ON public.jobs(trello_card_id)
  WHERE trello_card_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_lead_id ON public.jobs(lead_id);
CREATE INDEX IF NOT EXISTS idx_jobs_production_stage ON public.jobs(production_stage);
CREATE INDEX IF NOT EXISTS idx_jobs_trello_card_id ON public.jobs(trello_card_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_active_per_lead
  ON public.jobs(lead_id)
  WHERE is_active = true AND archived_at IS NULL;

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_read_authenticated" ON public.jobs;
DROP POLICY IF EXISTS "jobs_write_admin" ON public.jobs;

CREATE POLICY "jobs_read_authenticated"
  ON public.jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "jobs_write_admin"
  ON public.jobs FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));

CREATE TABLE IF NOT EXISTS public.job_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.job_stage_history
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS exited_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_stage_history'
      AND column_name = 'to_stage'
  ) THEN
    ALTER TABLE public.job_stage_history ALTER COLUMN to_stage DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'job_stage_history'
      AND column_name = 'changed_at'
  ) THEN
    UPDATE public.job_stage_history
    SET stage = COALESCE(stage, to_stage),
        entered_at = COALESCE(entered_at, changed_at),
        created_at = COALESCE(created_at, changed_at, now())
    WHERE stage IS NULL OR entered_at IS NULL OR created_at IS NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.job_stage_history WHERE stage IS NULL) THEN
    ALTER TABLE public.job_stage_history ALTER COLUMN stage SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_stage_history_job_id_fkey'
  ) THEN
    ALTER TABLE public.job_stage_history
      ADD CONSTRAINT job_stage_history_job_id_fkey
      FOREIGN KEY (job_id)
      REFERENCES public.jobs(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_stage_history_job_id ON public.job_stage_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_stage_history_stage ON public.job_stage_history(stage);
CREATE INDEX IF NOT EXISTS idx_job_stage_history_entered_at ON public.job_stage_history(entered_at);

ALTER TABLE public.job_stage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_stage_history_read_authenticated" ON public.job_stage_history;
DROP POLICY IF EXISTS "job_stage_history_write_admin" ON public.job_stage_history;

CREATE POLICY "job_stage_history_read_authenticated"
  ON public.job_stage_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "job_stage_history_write_admin"
  ON public.job_stage_history FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));
