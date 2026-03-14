-- Add response_language preference to user_preferences
-- Allows users to set their preferred response language for LLM outputs
-- Separate from UI language (which only supports en/zh)

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS response_language TEXT DEFAULT 'auto';

COMMENT ON COLUMN user_preferences.response_language IS 'Preferred response language for LLM outputs: auto (detect from query/browser), English, Chinese, Japanese, Korean, Spanish, French, German';

-- Update the upsert_user_preferences function to handle response_language
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_default_provider TEXT DEFAULT NULL,
  p_default_mode TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_response_language TEXT DEFAULT NULL
)
RETURNS user_preferences AS $$
DECLARE
  v_user_id UUID;
  v_result user_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_preferences (user_id, default_provider, default_mode, language, response_language, updated_at)
  VALUES (
    v_user_id,
    COALESCE(p_default_provider, 'deepseek'),
    COALESCE(p_default_mode, 'web'),
    COALESCE(p_language, 'en'),
    COALESCE(p_response_language, 'auto'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_provider = COALESCE(p_default_provider, user_preferences.default_provider),
    default_mode = COALESCE(p_default_mode, user_preferences.default_mode),
    language = COALESCE(p_language, user_preferences.language),
    response_language = COALESCE(p_response_language, user_preferences.response_language),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old function signature and grant on new one
DROP FUNCTION IF EXISTS public.upsert_user_preferences(TEXT, TEXT, TEXT);
GRANT EXECUTE ON FUNCTION public.upsert_user_preferences(TEXT, TEXT, TEXT, TEXT) TO authenticated;
