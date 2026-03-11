-- Migration: 004_research_memory.sql
-- Feature: 007-research-memory
-- Creates research_memory and user_expertise tables for cross-session research memory.

-- Enable pg_trgm for fuzzy topic matching (built-in on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ══════════════════════════════════════════════════════════════════════
-- Table: research_memory
-- Stores compressed research summaries per session for cross-session context.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE research_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_query TEXT NOT NULL,
    research_summary TEXT NOT NULL,
    entities JSONB DEFAULT '[]',
    filled_gaps JSONB DEFAULT '[]',
    open_gaps JSONB DEFAULT '[]',
    resolved_contradictions JSONB DEFAULT '[]',
    key_claims JSONB DEFAULT '[]',
    search_mode TEXT NOT NULL CHECK (search_mode IN ('research', 'deep')),
    source_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_research_memory_user ON research_memory(user_id);
CREATE INDEX idx_research_memory_topic ON research_memory USING gin (topic_query gin_trgm_ops);
CREATE INDEX idx_research_memory_expires ON research_memory(expires_at);

ALTER TABLE research_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_memory_user_policy ON research_memory
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- Table: user_expertise
-- Tracks per-domain research frequency for expertise level calculation.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE user_expertise (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    query_count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, domain)
);

ALTER TABLE user_expertise ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_expertise_user_policy ON user_expertise
    FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════
-- RPC: retrieve_research_memories
-- Returns up to 3 memories ranked by 70% topic similarity + 30% freshness.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION retrieve_research_memories(
    p_user_id UUID,
    p_query TEXT
)
RETURNS TABLE (
    id UUID,
    topic_query TEXT,
    research_summary TEXT,
    entities JSONB,
    filled_gaps JSONB,
    open_gaps JSONB,
    resolved_contradictions JSONB,
    key_claims JSONB,
    created_at TIMESTAMPTZ,
    search_mode TEXT,
    source_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        rm.id,
        rm.topic_query,
        rm.research_summary,
        rm.entities,
        rm.filled_gaps,
        rm.open_gaps,
        rm.resolved_contradictions,
        rm.key_claims,
        rm.created_at,
        rm.search_mode,
        rm.source_count
    FROM research_memory rm
    WHERE rm.user_id = p_user_id
        AND rm.expires_at > now()
        AND similarity(rm.topic_query, p_query) > 0.2
    ORDER BY (similarity(rm.topic_query, p_query) * 0.7
              + (1 - EXTRACT(EPOCH FROM (now() - rm.created_at))
                   / EXTRACT(EPOCH FROM (rm.expires_at - rm.created_at))) * 0.3) DESC
    LIMIT 3;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- RPC: find_similar_memory
-- Returns existing memory with similarity above threshold (for upsert).
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION find_similar_memory(
    p_user_id UUID,
    p_query TEXT,
    p_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (id UUID, topic_query TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT rm.id, rm.topic_query
    FROM research_memory rm
    WHERE rm.user_id = p_user_id
        AND similarity(rm.topic_query, p_query) > p_threshold
    ORDER BY similarity(rm.topic_query, p_query) DESC
    LIMIT 1;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- RPC: upsert_user_expertise
-- Increment query_count for a domain or insert new row.
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION upsert_user_expertise(
    p_user_id UUID,
    p_domain TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
    INSERT INTO user_expertise (user_id, domain, query_count, last_searched_at)
    VALUES (p_user_id, p_domain, 1, now())
    ON CONFLICT (user_id, domain)
    DO UPDATE SET
        query_count = user_expertise.query_count + 1,
        last_searched_at = now();
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Column: research_memory_enabled on user_limits
-- Opt-in preference for research memory (default off).
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS research_memory_enabled BOOLEAN DEFAULT false;

-- ══════════════════════════════════════════════════════════════════════
-- Cron: daily cleanup of expired research memories
-- Requires pg_cron extension (enabled on Supabase via Dashboard > Extensions)
-- ══════════════════════════════════════════════════════════════════════

SELECT cron.schedule(
    'cleanup-expired-research-memory',
    '0 4 * * *',  -- 4 AM daily
    $$DELETE FROM public.research_memory WHERE expires_at < now()$$
);

-- ══════════════════════════════════════════════════════════════════════
-- DOWN migration (for reversibility per Constitution Principle VII):
--
-- SELECT cron.unschedule('cleanup-expired-research-memory');
-- ALTER TABLE user_limits DROP COLUMN IF EXISTS research_memory_enabled;
-- DROP FUNCTION IF EXISTS upsert_user_expertise(UUID, TEXT);
-- DROP FUNCTION IF EXISTS find_similar_memory(UUID, TEXT, FLOAT);
-- DROP FUNCTION IF EXISTS retrieve_research_memories(UUID, TEXT);
-- DROP POLICY IF EXISTS user_expertise_user_policy ON user_expertise;
-- DROP TABLE IF EXISTS user_expertise;
-- DROP POLICY IF EXISTS research_memory_user_policy ON research_memory;
-- DROP INDEX IF EXISTS idx_research_memory_expires;
-- DROP INDEX IF EXISTS idx_research_memory_topic;
-- DROP INDEX IF EXISTS idx_research_memory_user;
-- DROP TABLE IF EXISTS research_memory;
-- Note: DROP EXTENSION IF EXISTS pg_trgm — only if no other tables use it
-- ══════════════════════════════════════════════════════════════════════
