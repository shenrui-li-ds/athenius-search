-- Classification log for monitoring query classification patterns
-- Used by fire-and-forget logging in /api/research/plan

CREATE TABLE IF NOT EXISTS public.classification_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  query text NOT NULL,
  query_type text NOT NULL,
  query_context text,
  suggested_depth text NOT NULL,
  provider text,
  cached boolean DEFAULT false,
  latency_ms integer,
  created_at timestamptz DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX idx_classification_log_created_at ON public.classification_log (created_at DESC);
CREATE INDEX idx_classification_log_query_type ON public.classification_log (query_type);

-- RLS enabled with no permissive policies for anon/authenticated roles.
-- Only service_role (which bypasses RLS) can read/write this table.
-- This is a server-only analytics table — no client access needed.
ALTER TABLE public.classification_log ENABLE ROW LEVEL SECURITY;

-- Cleanup function for old entries (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_classification_logs(p_days_old integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.classification_log
  WHERE created_at < now() - (p_days_old || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
