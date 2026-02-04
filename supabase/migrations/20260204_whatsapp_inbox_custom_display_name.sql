ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS custom_display_name text;

