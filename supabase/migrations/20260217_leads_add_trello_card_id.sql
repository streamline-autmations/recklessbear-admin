ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS trello_card_id TEXT;

