-- Migration: Add search threads for threaded conversational search
-- Feature: 004-threaded-search

-- Thread metadata
CREATE TABLE search_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'web' CHECK (mode = 'web'),
  provider TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  thread_summary TEXT,
  bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Individual messages within a thread
CREATE TABLE thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES search_threads(id) ON DELETE CASCADE,
  sequence_num INTEGER NOT NULL,
  query TEXT NOT NULL,
  refined_query TEXT,
  provider TEXT NOT NULL,
  content TEXT,
  sources JSONB DEFAULT '[]'::jsonb,
  images JSONB DEFAULT '[]'::jsonb,
  search_intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(thread_id, sequence_num)
);

-- Indexes
CREATE INDEX idx_search_threads_user
  ON search_threads(user_id, deleted_at, updated_at DESC);
CREATE INDEX idx_search_threads_bookmarked
  ON search_threads(user_id, bookmarked, deleted_at)
  WHERE bookmarked = TRUE;
CREATE INDEX idx_thread_messages_thread
  ON thread_messages(thread_id, sequence_num);

-- RLS
ALTER TABLE search_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads"
  ON search_threads FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users access own thread messages"
  ON thread_messages FOR ALL
  USING (thread_id IN (
    SELECT id FROM search_threads WHERE user_id = auth.uid()
  ));

-- Auto-update thread metadata when message inserted
CREATE OR REPLACE FUNCTION update_thread_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE search_threads
  SET updated_at = NOW(),
      message_count = (
        SELECT COUNT(*) FROM thread_messages WHERE thread_id = NEW.thread_id
      )
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER thread_message_inserted
  AFTER INSERT ON thread_messages
  FOR EACH ROW EXECUTE FUNCTION update_thread_on_message();

-- Cleanup empty threads (no messages after 1 hour)
CREATE OR REPLACE FUNCTION cleanup_empty_threads()
RETURNS void AS $$
BEGIN
  DELETE FROM search_threads
  WHERE message_count = 0
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
