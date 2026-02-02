ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS wa_id text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'wa_conversations'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'wa_conversations_job_id_fkey'
  ) THEN
    ALTER TABLE public.wa_conversations
      ADD CONSTRAINT wa_conversations_job_id_fkey
      FOREIGN KEY (job_id)
      REFERENCES public.jobs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.wa_conversations
SET provider = COALESCE(provider, 'whatsapp')
WHERE provider IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conversations_phone_unique
  ON public.wa_conversations(phone);

CREATE INDEX IF NOT EXISTS idx_wa_conversations_wa_id
  ON public.wa_conversations(wa_id);

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS to_phone text,
  ADD COLUMN IF NOT EXISTS from_phone text,
  ADD COLUMN IF NOT EXISTS provider_payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_messages_provider_message_id_unique
  ON public.wa_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_status
  ON public.wa_messages(status);

CREATE INDEX IF NOT EXISTS idx_wa_messages_direction
  ON public.wa_messages(direction);
