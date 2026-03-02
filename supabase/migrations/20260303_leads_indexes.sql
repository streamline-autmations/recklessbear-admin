-- Create indexes for common filters and sorts on the leads table to improve query performance

-- Filter by status (frequently used)
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

-- Filter by assigned rep (frequently used)
CREATE INDEX IF NOT EXISTS idx_leads_assigned_rep_id ON public.leads(assigned_rep_id);

-- Sort by created_at (default sort)
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- Search indexes (using trigram or standard b-tree for text search)
-- For ILIKE '%query%' searches, standard b-tree indexes don't help much unless using a specific extension like pg_trgm.
-- However, b-tree indexes help for exact matches or prefix searches if we switch to that.
-- For now, let's add standard indexes which are still better than nothing for equality checks or sorting.

CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON public.leads(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads(phone);

-- Composite index for status + created_at (common pattern: filter by status, sort by date)
CREATE INDEX IF NOT EXISTS idx_leads_status_created_at ON public.leads(status, created_at DESC);

-- Composite index for rep + created_at
CREATE INDEX IF NOT EXISTS idx_leads_rep_created_at ON public.leads(assigned_rep_id, created_at DESC);
