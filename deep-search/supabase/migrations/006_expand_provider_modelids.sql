-- Migration: Expand default_provider CHECK constraint to accept all ModelId values
-- The UI now sends ModelId (e.g., 'gemini-pro', 'haiku') instead of just LLMProvider values.
-- The old constraint only allowed: deepseek, openai, grok, claude, gemini, vercel-gateway

-- Drop old constraint and add expanded one
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_default_provider_check;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_default_provider_check
  CHECK (default_provider IN (
    -- Original LLMProvider values
    'deepseek', 'openai', 'grok', 'claude', 'gemini', 'vercel-gateway',
    -- New ModelId values
    'gemini-pro', 'openai-mini', 'haiku', 'sonnet', 'minimax', 'glm', 'kimi', 'qwen'
  ));
