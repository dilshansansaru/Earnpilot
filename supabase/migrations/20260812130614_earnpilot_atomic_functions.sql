/*
# EarnPilot Atomic Database Functions

## Overview
Creates SECURITY DEFINER functions for atomic, safe operations.
Called by edge functions (server-side) with the service role key.
Enforces: balance updates, double-claim prevention, atomic withdrawals,
reward code redemption, daily bonus, referral milestones, user upsert.

## Functions
- credit_balance: Atomically credits balance + creates transaction ledger entry.
- debit_balance: Atomically debits balance (if sufficient) + creates transaction ledger entry.
- start_mining: Creates mining session if none active. Uses settings for reward/duration.
- claim_mining: Claims completed session. Verifies ownership, time, not already claimed.
- complete_ad_view: Records verified ad view, credits user, updates referral milestones.
- complete_task: Records unique task completion, credits balance.
- claim_daily_bonus: Claims daily bonus with 7-day streak logic. Prevents duplicate claims.
- redeem_reward_code: Atomically redeems code. Validates active, not expired, under limits.
- create_withdrawal: Creates pending withdrawal. Validates min/max, balance, no pending. Debits balance.
- update_withdrawal_status: Updates withdrawal status. Refunds on REJECTED.
- upsert_telegram_user: Creates or updates user from Telegram auth. Processes referrals + join reward.

## Security
All functions are SECURITY DEFINER. Called only via service role from edge functions.
*/

CREATE OR REPLACE FUNCTION credit_balance(
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_reference_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT balance INTO v_balance_before FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  v_balance_after := v_balance_before + p_amount;
  UPDATE users SET balance = v_balance_after, updated_at = now() WHERE id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, metadata)
  VALUES (p_user_id, p_type, p_amount, v_balance_before, v_balance_after, p_reference_id, p_metadata);
  RETURN v_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION debit_balance(
  p_user_id uuid,
  p_type text,
  p_amount numeric,
  p_reference_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  SELECT balance INTO v_balance_before FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_balance_before < p_amount THEN
    RETURN NULL;
  END IF;
  v_balance_after := v_balance_before - p_amount;
  UPDATE users SET balance = v_balance_after, updated_at = now() WHERE id = p_user_id;
  INSERT INTO transactions (user_id, type, amount, balance_before, balance_after, reference_id, metadata)
  VALUES (p_user_id, p_type, p_amount, v_balance_before, v_balance_after, p_reference_id, p_metadata);
  RETURN v_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION start_mining(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_active_count int;
  v_reward numeric;
  v_duration int;
  v_session RECORD;
  v_today_count int;
  v_daily_limit int;
BEGIN
  SELECT mining_reward_per_hour, mining_duration_minutes, mining_daily_limit
  INTO v_reward, v_duration, v_daily_limit
  FROM system_settings WHERE id = 1;

  SELECT count(*) INTO v_active_count FROM mining_sessions
  WHERE user_id = p_user_id AND status = 'ACTIVE';

  IF v_active_count > 0 THEN
    RETURN jsonb_build_object('error', 'You already have an active mining session');
  END IF;

  SELECT count(*) INTO v_today_count FROM mining_sessions
  WHERE user_id = p_user_id AND DATE(started_at) = DATE(now());

  IF v_daily_limit > 0 AND v_today_count >= v_daily_limit THEN
    RETURN jsonb_build_object('error', 'Daily mining limit reached');
  END IF;

  INSERT INTO mining_sessions (user_id, started_at, expires_at, reward, status)
  VALUES (p_user_id, now(), now() + (v_duration || ' minutes')::interval, v_reward, 'ACTIVE')
  RETURNING * INTO v_session;

  UPDATE users SET last_mining_at = now(), mining_count = mining_count + 1 WHERE id = p_user_id;

  RETURN jsonb_build_object('session', to_jsonb(v_session));
END;
$$;

CREATE OR REPLACE FUNCTION claim_mining(p_user_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_session mining_sessions%ROWTYPE;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_session FROM mining_sessions WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Session not found');
  END IF;
  IF v_session.status = 'CLAIMED' THEN
    RETURN jsonb_build_object('error', 'Reward already claimed');
  END IF;
  IF v_session.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('error', 'Session was cancelled');
  END IF;
  IF now() < v_session.expires_at THEN
    RETURN jsonb_build_object('error', 'Mining not complete yet', 'expires_at', v_session.expires_at);
  END IF;

  v_new_balance := credit_balance(p_user_id, 'MINING', v_session.reward, v_session.id::text);
  UPDATE mining_sessions SET status = 'CLAIMED', claimed_at = now() WHERE id = p_session_id;

  RETURN jsonb_build_object('reward', v_session.reward, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION complete_ad_view(
  p_user_id uuid,
  p_ad_id uuid,
  p_network text,
  p_reward numeric,
  p_verification_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
  v_ad_view_id uuid;
  v_referral RECORD;
  v_referrer_id uuid;
  v_day1_ads_needed int;
  v_day2_ads_needed int;
  v_day1_reward numeric;
  v_day2_reward numeric;
  v_milestones jsonb;
  v_day1_count int;
  v_day2_count int;
BEGIN
  INSERT INTO ad_views (user_id, ad_id, network, completed_at, reward, verification_id, status)
  VALUES (p_user_id, p_ad_id, p_network, now(), p_reward, p_verification_id, 'VERIFIED')
  RETURNING id INTO v_ad_view_id;

  v_new_balance := credit_balance(p_user_id, 'AD_REWARD', p_reward, v_ad_view_id::text);
  UPDATE users SET ads_watched = ads_watched + 1, last_ad_at = now() WHERE id = p_user_id;

  v_milestones := '[]'::jsonb;
  SELECT referred_by INTO v_referrer_id FROM users WHERE id = p_user_id;

  IF v_referrer_id IS NOT NULL THEN
    SELECT * INTO v_referral FROM referrals WHERE referred_id = p_user_id;
    IF v_referral IS NOT NULL THEN
      SELECT referral_day1_ads, referral_day2_ads, referral_day1_reward, referral_day2_reward
      INTO v_day1_ads_needed, v_day2_ads_needed, v_day1_reward, v_day2_reward
      FROM system_settings WHERE id = 1;

      IF NOT v_referral.day1_reward_paid THEN
        SELECT count(*) INTO v_day1_count FROM ad_views
        WHERE user_id = p_user_id AND status = 'VERIFIED'
          AND created_at <= v_referral.created_at + interval '1 day';
        IF v_day1_count >= v_day1_ads_needed THEN
          PERFORM credit_balance(v_referrer_id, 'REFERRAL_DAY1', v_day1_reward, p_user_id::text);
          UPDATE referrals SET day1_reward_paid = true WHERE id = v_referral.id;
          v_milestones := v_milestones || jsonb_build_object('milestone', 'day1', 'reward', v_day1_reward);
        END IF;
      END IF;

      IF NOT v_referral.day2_reward_paid THEN
        SELECT count(*) INTO v_day2_count FROM ad_views
        WHERE user_id = p_user_id AND status = 'VERIFIED'
          AND created_at > v_referral.created_at + interval '1 day'
          AND created_at <= v_referral.created_at + interval '2 days';
        IF v_day2_count >= v_day2_ads_needed THEN
          PERFORM credit_balance(v_referrer_id, 'REFERRAL_DAY2', v_day2_reward, p_user_id::text);
          UPDATE referrals SET day2_reward_paid = true WHERE id = v_referral.id;
          v_milestones := v_milestones || jsonb_build_object('milestone', 'day2', 'reward', v_day2_reward);
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('reward', p_reward, 'new_balance', v_new_balance, 'milestones', v_milestones);
END;
$$;

CREATE OR REPLACE FUNCTION complete_task(p_user_id uuid, p_task_id uuid, p_reward numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_balance numeric;
  v_completion_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM task_completions WHERE user_id = p_user_id AND task_id = p_task_id) THEN
    RETURN jsonb_build_object('error', 'Task already completed');
  END IF;

  INSERT INTO task_completions (user_id, task_id, reward)
  VALUES (p_user_id, p_task_id, p_reward)
  RETURNING id INTO v_completion_id;

  v_new_balance := credit_balance(p_user_id, 'TASK_REWARD', p_reward, v_completion_id::text);
  UPDATE users SET tasks_completed = tasks_completed + 1 WHERE id = p_user_id;

  RETURN jsonb_build_object('reward', p_reward, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION claim_daily_bonus(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rewards jsonb;
  v_last_claim timestamptz;
  v_day int;
  v_reward numeric;
  v_new_balance numeric;
  v_today date;
BEGIN
  SELECT daily_bonus_rewards INTO v_rewards FROM system_settings WHERE id = 1;
  SELECT last_daily_bonus_at, daily_bonus_day INTO v_last_claim, v_day FROM users WHERE id = p_user_id;
  v_today := DATE(now());

  IF v_last_claim IS NOT NULL AND DATE(v_last_claim) = v_today THEN
    RETURN jsonb_build_object('error', 'Daily bonus already claimed today');
  END IF;

  IF v_last_claim IS NOT NULL AND DATE(v_last_claim) = v_today - 1 THEN
    v_day := v_day + 1;
    IF v_day > 7 THEN v_day := 1; END IF;
  ELSE
    v_day := 1;
  END IF;

  v_reward := (v_rewards -> (v_day - 1))::numeric;

  INSERT INTO daily_bonus_claims (user_id, day_number, reward)
  VALUES (p_user_id, v_day, v_reward);

  v_new_balance := credit_balance(p_user_id, 'DAILY_BONUS', v_reward, NULL);
  UPDATE users SET last_daily_bonus_at = now(), daily_bonus_day = v_day WHERE id = p_user_id;

  RETURN jsonb_build_object('day', v_day, 'reward', v_reward, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION redeem_reward_code(p_user_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code reward_codes%ROWTYPE;
  v_claim_count int;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_code FROM reward_codes WHERE LOWER(code) = LOWER(p_code) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid reward code');
  END IF;
  IF v_code.status != 'active' THEN
    RETURN jsonb_build_object('error', 'This code is no longer active');
  END IF;
  IF v_code.expires_at IS NOT NULL AND now() > v_code.expires_at THEN
    RETURN jsonb_build_object('error', 'This code has expired');
  END IF;
  IF v_code.max_uses > 0 AND v_code.used_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('error', 'This code has reached its maximum uses');
  END IF;

  SELECT count(*) INTO v_claim_count FROM reward_code_claims
  WHERE user_id = p_user_id AND code_id = v_code.id;
  IF v_claim_count >= v_code.per_user_limit THEN
    RETURN jsonb_build_object('error', 'You have already redeemed this code');
  END IF;

  INSERT INTO reward_code_claims (user_id, code_id, code, reward)
  VALUES (p_user_id, v_code.id, v_code.code, v_code.reward);
  UPDATE reward_codes SET used_count = used_count + 1 WHERE id = v_code.id;
  v_new_balance := credit_balance(p_user_id, 'REWARD_CODE', v_code.reward, v_code.id::text);

  RETURN jsonb_build_object('reward', v_code.reward, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION create_withdrawal(
  p_user_id uuid,
  p_amount_pilot numeric,
  p_wallet_address text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_settings RECORD;
  v_user RECORD;
  v_amount_usdt numeric;
  v_fee_usdt numeric;
  v_withdrawal RECORD;
  v_new_balance numeric;
  v_pending_count int;
  v_min_pilot numeric;
  v_max_pilot numeric;
BEGIN
  SELECT * INTO v_settings FROM system_settings WHERE id = 1;
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;
  IF v_user.status != 'active' THEN
    RETURN jsonb_build_object('error', 'Account is not active');
  END IF;
  IF v_user.balance_frozen THEN
    RETURN jsonb_build_object('error', 'Balance is frozen');
  END IF;

  v_min_pilot := v_settings.usdt_min_withdraw / v_settings.pilot_usdt_rate;
  v_max_pilot := v_settings.usdt_max_withdraw / v_settings.pilot_usdt_rate;

  IF p_amount_pilot < v_min_pilot THEN
    RETURN jsonb_build_object('error', 'Minimum withdrawal is ' || v_min_pilot || ' Pilot');
  END IF;
  IF p_amount_pilot > v_max_pilot THEN
    RETURN jsonb_build_object('error', 'Maximum withdrawal is ' || v_max_pilot || ' Pilot');
  END IF;
  IF v_user.balance < p_amount_pilot THEN
    RETURN jsonb_build_object('error', 'Insufficient balance');
  END IF;

  SELECT count(*) INTO v_pending_count FROM withdrawals
  WHERE user_id = p_user_id AND status IN ('PENDING','PROCESSING');
  IF v_pending_count > 0 THEN
    RETURN jsonb_build_object('error', 'You already have a pending withdrawal');
  END IF;

  v_amount_usdt := p_amount_pilot * v_settings.pilot_usdt_rate;
  v_fee_usdt := v_settings.usdt_fee_fixed + (v_amount_usdt * v_settings.usdt_fee_percent / 100);

  v_new_balance := debit_balance(p_user_id, 'WITHDRAWAL', p_amount_pilot, NULL);
  IF v_new_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'Insufficient balance');
  END IF;

  INSERT INTO withdrawals (user_id, amount_pilot, amount_usdt, fee_usdt, network, wallet_address, status)
  VALUES (p_user_id, p_amount_pilot, v_amount_usdt, v_fee_usdt, 'BEP20', p_wallet_address, 'PENDING')
  RETURNING * INTO v_withdrawal;

  RETURN jsonb_build_object('withdrawal', to_jsonb(v_withdrawal), 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION update_withdrawal_status(
  p_withdrawal_id uuid,
  p_status text,
  p_admin_id text DEFAULT NULL,
  p_tx_hash text DEFAULT NULL,
  p_explorer_url text DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_withdrawal withdrawals%ROWTYPE;
  v_new_balance numeric;
BEGIN
  SELECT * INTO v_withdrawal FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Withdrawal not found');
  END IF;

  IF p_status = 'REJECTED' AND v_withdrawal.status IN ('PENDING','PROCESSING') THEN
    v_new_balance := credit_balance(v_withdrawal.user_id, 'ADMIN_ADJUSTMENT', v_withdrawal.amount_pilot, v_withdrawal.id::text, jsonb_build_object('reason', 'withdrawal_refund'));
  END IF;

  UPDATE withdrawals SET
    status = p_status,
    admin_id = COALESCE(NULLIF(p_admin_id, '')::uuid, v_withdrawal.admin_id),
    tx_hash = COALESCE(p_tx_hash, v_withdrawal.tx_hash),
    explorer_url = COALESCE(p_explorer_url, v_withdrawal.explorer_url),
    admin_note = COALESCE(p_note, v_withdrawal.admin_note),
    processed_at = CASE WHEN p_status IN ('PAID','REJECTED','CANCELLED') THEN now() ELSE v_withdrawal.processed_at END
  WHERE id = p_withdrawal_id;

  IF p_status = 'PAID' THEN
    UPDATE users SET total_withdrawn = total_withdrawn + v_withdrawal.amount_usdt WHERE id = v_withdrawal.user_id;
  END IF;

  SELECT * INTO v_withdrawal FROM withdrawals WHERE id = p_withdrawal_id;
  RETURN jsonb_build_object('withdrawal', to_jsonb(v_withdrawal), 'refunded_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION upsert_telegram_user(
  p_telegram_id bigint,
  p_username text,
  p_first_name text,
  p_last_name text,
  p_photo_url text,
  p_ref_start text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_referrer users%ROWTYPE;
  v_join_reward numeric;
  v_new_referral boolean := false;
  v_ref_code text;
BEGIN
  SELECT * INTO v_user FROM users WHERE telegram_id = p_telegram_id;

  IF NOT FOUND THEN
    v_ref_code := 'ref_' || p_telegram_id;

    BEGIN
      INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referral_code, last_login_at)
      VALUES (p_telegram_id, p_username, p_first_name, p_last_name, p_photo_url, v_ref_code, now())
      RETURNING * INTO v_user;
    EXCEPTION WHEN unique_violation THEN
      v_ref_code := 'ref_' || p_telegram_id || '_' || substr(md5(random()::text), 1, 4);
      INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referral_code, last_login_at)
      VALUES (p_telegram_id, p_username, p_first_name, p_last_name, p_photo_url, v_ref_code, now())
      RETURNING * INTO v_user;
    END;

    -- Process referral from ref_START parameter
    IF p_ref_start IS NOT NULL AND p_ref_start LIKE 'ref\_%' ESCAPE '\' THEN
      SELECT * INTO v_referrer FROM users WHERE referral_code = p_ref_start AND id != v_user.id;
      IF v_referrer IS NOT NULL THEN
        UPDATE users SET referred_by = v_referrer.id WHERE id = v_user.id;
        v_new_referral := true;
      END IF;
    END IF;

    IF v_new_referral THEN
      SELECT referral_join_reward INTO v_join_reward FROM system_settings WHERE id = 1;
      INSERT INTO referrals (referrer_id, referred_id) VALUES (v_referrer.id, v_user.id);
      PERFORM credit_balance(v_referrer.id, 'REFERRAL_JOIN', v_join_reward, v_user.id::text);
    END IF;
  ELSE
    UPDATE users SET
      username = COALESCE(p_username, v_user.username),
      first_name = COALESCE(p_first_name, v_user.first_name),
      last_name = COALESCE(p_last_name, v_user.last_name),
      photo_url = COALESCE(p_photo_url, v_user.photo_url),
      last_login_at = now(),
      updated_at = now()
    WHERE id = v_user.id
    RETURNING * INTO v_user;
  END IF;

  RETURN jsonb_build_object('user', to_jsonb(v_user), 'is_new', v_new_referral);
END;
$$;
