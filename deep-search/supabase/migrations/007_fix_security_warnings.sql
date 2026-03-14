-- Migration: Fix Supabase Linter security and performance warnings
-- 1. Set search_path on functions (security)
-- 2. Move pg_trgm to extensions schema (security)
-- 3. Optimize RLS policies with (select auth.uid()) (performance)

-- ══════════════════════════════════════════════════════════════════════
-- 1. Fix mutable search_path on functions
-- ══════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.upsert_user_expertise SET search_path = public;
ALTER FUNCTION public.retrieve_research_memories SET search_path = public;
ALTER FUNCTION public.find_similar_memory SET search_path = public;
ALTER FUNCTION public.cleanup_expired_history_content SET search_path = public;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Move pg_trgm to extensions schema
-- ══════════════════════════════════════════════════════════════════════

-- Create extensions schema if not exists (Supabase projects usually have it)
CREATE SCHEMA IF NOT EXISTS extensions;

-- Drop dependent index first, then move extension
DROP INDEX IF EXISTS idx_research_memory_topic;
DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Recreate the trgm index with extension in new schema
CREATE INDEX idx_research_memory_topic ON research_memory USING gin (topic_query extensions.gin_trgm_ops);

-- Update functions that use pg_trgm operators to reference extensions schema
-- retrieve_research_memories uses similarity() and %
CREATE OR REPLACE FUNCTION retrieve_research_memories(
    p_topic TEXT,
    p_search_mode TEXT DEFAULT 'research',
    p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
    id UUID,
    topic_query TEXT,
    compressed_summary TEXT,
    key_claims TEXT[],
    key_entities TEXT[],
    filled_gaps JSONB,
    search_mode TEXT,
    created_at TIMESTAMPTZ,
    similarity_score DOUBLE PRECISION,
    age_days INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rm.id,
        rm.topic_query,
        rm.compressed_summary,
        rm.key_claims,
        rm.key_entities,
        rm.filled_gaps,
        rm.search_mode,
        rm.created_at,
        extensions.similarity(rm.topic_query, p_topic)::DOUBLE PRECISION AS similarity_score,
        EXTRACT(DAY FROM now() - rm.created_at)::INTEGER AS age_days
    FROM research_memory rm
    WHERE rm.user_id = auth.uid()
      AND rm.expires_at > now()
      AND rm.search_mode = p_search_mode
      AND extensions.similarity(rm.topic_query, p_topic) > 0.2
    ORDER BY
        (0.7 * extensions.similarity(rm.topic_query, p_topic) +
         0.3 * (1.0 - LEAST(EXTRACT(EPOCH FROM now() - rm.created_at) / (30 * 86400), 1.0)))
        DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- find_similar_memory uses similarity()
CREATE OR REPLACE FUNCTION find_similar_memory(
    p_topic TEXT,
    p_search_mode TEXT DEFAULT 'research',
    p_threshold DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    topic_query TEXT,
    similarity_score DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rm.id,
        rm.topic_query,
        extensions.similarity(rm.topic_query, p_topic)::DOUBLE PRECISION AS similarity_score
    FROM research_memory rm
    WHERE rm.user_id = auth.uid()
      AND rm.expires_at > now()
      AND rm.search_mode = p_search_mode
      AND extensions.similarity(rm.topic_query, p_topic) > p_threshold
    ORDER BY extensions.similarity(rm.topic_query, p_topic) DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Optimize RLS policies: (select auth.uid()) prevents per-row re-evaluation
-- ══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS research_memory_user_policy ON research_memory;
CREATE POLICY research_memory_user_policy ON research_memory
    FOR ALL USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_expertise_user_policy ON user_expertise;
CREATE POLICY user_expertise_user_policy ON user_expertise
    FOR ALL USING ((select auth.uid()) = user_id);
