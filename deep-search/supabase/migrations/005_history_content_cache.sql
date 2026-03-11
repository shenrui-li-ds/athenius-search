-- ══════════════════════════════════════════════════════════════════════
-- Migration 005: History Content Cache
--
-- Stores final rendered content alongside search history entries so
-- reloading from Library displays the exact same result without
-- re-running the pipeline.
--
-- TTL: 14 days (content nullified by cron, row preserved)
-- ══════════════════════════════════════════════════════════════════════

-- Add content cache columns to search_history
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS cached_content TEXT DEFAULT NULL;
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS cached_sources JSONB DEFAULT NULL;
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS cached_images JSONB DEFAULT NULL;
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS content_cached_at TIMESTAMPTZ DEFAULT NULL;

-- Index for cleanup query (only scan rows that have cached content)
CREATE INDEX IF NOT EXISTS idx_search_history_content_cached_at
  ON search_history (content_cached_at)
  WHERE content_cached_at IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- Cleanup function: nullify expired cached content (preserves history row)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_expired_history_content()
RETURNS void AS $$
BEGIN
  UPDATE search_history
  SET cached_content = NULL,
      cached_sources = NULL,
      cached_images = NULL,
      content_cached_at = NULL
  WHERE content_cached_at IS NOT NULL
    AND content_cached_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════════
-- Cron: weekly cleanup of expired history content (Sundays at 4 AM)
-- Requires pg_cron extension (enabled on Supabase via Dashboard > Extensions)
-- ══════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
    'cleanup-expired-history-content',
    '0 4 * * 0',  -- Sunday 4 AM
    $$SELECT public.cleanup_expired_history_content()$$
);

-- ══════════════════════════════════════════════════════════════════════
-- DOWN migration (for reversibility):
--
-- SELECT cron.unschedule('cleanup-expired-history-content');
-- DROP FUNCTION IF EXISTS public.cleanup_expired_history_content();
-- ALTER TABLE search_history DROP COLUMN IF EXISTS cached_content;
-- ALTER TABLE search_history DROP COLUMN IF EXISTS cached_sources;
-- ALTER TABLE search_history DROP COLUMN IF EXISTS cached_images;
-- ALTER TABLE search_history DROP COLUMN IF EXISTS content_cached_at;
-- DROP INDEX IF EXISTS idx_search_history_content_cached_at;
-- ══════════════════════════════════════════════════════════════════════
