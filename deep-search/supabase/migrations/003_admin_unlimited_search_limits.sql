-- Migration: Admin Unlimited Search Limits
-- Makes daily/monthly search limits tier-aware (admin gets unlimited),
-- matching the existing pattern for token limits.

-- Add tier-aware search limit helper functions (same pattern as token limits)

CREATE OR REPLACE FUNCTION public.get_tier_daily_search_limit(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 2147483647  -- Max INT (effectively unlimited)
    WHEN 'pro' THEN 100
    ELSE 50  -- 'free' tier
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_daily_search_limit(TEXT) SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_tier_monthly_search_limit(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 2147483647  -- Max INT (effectively unlimited)
    WHEN 'pro' THEN 5000
    ELSE 1000  -- 'free' tier
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_monthly_search_limit(TEXT) SET search_path = public;

-- Update reserve_and_authorize_search to use tier-aware search limits
CREATE OR REPLACE FUNCTION public.reserve_and_authorize_search(p_max_credits INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
  -- Search limits
  v_daily_search_limit INTEGER;
  v_daily_searches_used INTEGER;
  v_monthly_search_limit INTEGER;
  v_monthly_searches_used INTEGER;
  -- Token limits
  v_daily_token_limit INTEGER;
  v_daily_tokens_used INTEGER;
  v_monthly_token_limit INTEGER;
  v_monthly_tokens_used INTEGER;
  -- Credit variables
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_total_available INTEGER;
  v_reservation_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', FALSE, 'error', 'Not authenticated', 'error_type', 'auth');
  END IF;

  -- Ensure user_limits row exists
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset daily counters if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_daily_reset < CURRENT_DATE;

  -- Reset monthly counters if needed (including free credits)
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      free_credits_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get all limits and current usage in one query
  SELECT
    COALESCE(user_tier, 'free'),
    COALESCE(daily_searches_used, 0),
    COALESCE(monthly_searches_used, 0),
    COALESCE(daily_tokens_used, 0),
    COALESCE(monthly_tokens_used, 0),
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0)
  INTO
    v_tier,
    v_daily_searches_used,
    v_monthly_searches_used,
    v_daily_tokens_used,
    v_monthly_tokens_used,
    v_monthly_free,
    v_free_used,
    v_purchased
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate limits based on tier (search limits now tier-aware, like token limits)
  v_daily_search_limit := get_tier_daily_search_limit(v_tier);
  v_monthly_search_limit := get_tier_monthly_search_limit(v_tier);
  v_daily_token_limit := get_tier_daily_token_limit(v_tier);
  v_monthly_token_limit := get_tier_monthly_token_limit(v_tier);

  -- Check 1: Daily search limit (effectively skipped for admin via max INT)
  IF v_daily_searches_used >= v_daily_search_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'daily_search_limit',
      'reason', 'Daily search limit reached (' || v_daily_search_limit || ' searches). Resets at midnight.',
      'daily_searches_used', v_daily_searches_used,
      'daily_search_limit', v_daily_search_limit
    );
  END IF;

  -- Check 2: Monthly search limit (effectively skipped for admin via max INT)
  IF v_monthly_searches_used >= v_monthly_search_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'monthly_search_limit',
      'reason', 'Monthly search limit reached (' || v_monthly_search_limit || ' searches). Resets on the 1st.',
      'monthly_searches_used', v_monthly_searches_used,
      'monthly_search_limit', v_monthly_search_limit
    );
  END IF;

  -- Check 3: Daily token limit (effectively skipped for admin via max INT)
  IF v_daily_tokens_used >= v_daily_token_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'daily_token_limit',
      'reason', 'Daily token limit reached (' || v_daily_tokens_used || ' / ' || v_daily_token_limit || '). Resets at midnight.',
      'daily_tokens_used', v_daily_tokens_used,
      'daily_token_limit', v_daily_token_limit
    );
  END IF;

  -- Check 4: Monthly token limit (effectively skipped for admin via max INT)
  IF v_monthly_tokens_used >= v_monthly_token_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'monthly_token_limit',
      'reason', 'Monthly token limit reached (' || v_monthly_tokens_used || ' / ' || v_monthly_token_limit || '). Resets on the 1st.',
      'monthly_tokens_used', v_monthly_tokens_used,
      'monthly_token_limit', v_monthly_token_limit
    );
  END IF;

  -- Check 5: Credit availability
  v_free_available := v_monthly_free - v_free_used;
  v_total_available := v_free_available + v_purchased;

  IF v_total_available < p_max_credits THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'insufficient_credits',
      'reason', 'You need ' || p_max_credits || ' credits but only have ' || v_total_available || '. Purchase more credits to continue.',
      'credits_needed', p_max_credits,
      'credits_available', v_total_available,
      'free_remaining', v_free_available,
      'purchased_remaining', v_purchased
    );
  END IF;

  -- All checks passed - create reservation and increment search counters
  INSERT INTO credit_reservations (user_id, reserved_credits, status)
  VALUES (v_user_id, p_max_credits, 'pending')
  RETURNING id INTO v_reservation_id;

  -- Reserve credits and increment search counters atomically
  IF v_free_available >= p_max_credits THEN
    -- All from free credits
    UPDATE user_limits
    SET free_credits_used = free_credits_used + p_max_credits,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSIF v_free_available > 0 THEN
    -- Use all remaining free + some purchased
    UPDATE user_limits
    SET free_credits_used = monthly_free_credits,
        purchased_credits = purchased_credits - (p_max_credits - v_free_available),
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSE
    -- All from purchased
    UPDATE user_limits
    SET purchased_credits = purchased_credits - p_max_credits,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- Success
  RETURN json_build_object(
    'allowed', TRUE,
    'reservation_id', v_reservation_id,
    'reserved', p_max_credits,
    'remaining_after_reserve', v_total_available - p_max_credits,
    'user_tier', v_tier,
    'daily_searches_used', v_daily_searches_used + 1,
    'daily_search_limit', v_daily_search_limit,
    'monthly_searches_used', v_monthly_searches_used + 1,
    'monthly_search_limit', v_monthly_search_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.reserve_and_authorize_search(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.reserve_and_authorize_search(INTEGER) TO authenticated;
