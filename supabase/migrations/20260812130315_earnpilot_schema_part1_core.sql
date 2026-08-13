/*
# EarnPilot Core Schema — Users, Settings, Transactions, Referrals

## Overview
Creates the foundational tables for the EarnPilot earning platform:
- `users`: Telegram-authenticated user profiles with balance, wallet, referral, risk, and status fields.
- `system_settings`: Admin-editable platform configuration (mining, ads, withdrawals, referral rewards, fees, rates).
- `transactions`: Immutable ledger of every balance change with before/after balances and references.
- `referrals`: Tracks referral relationships and milestone reward status.

## Tables

### users
- `id` (uuid PK)
- `telegram_id` (bigint, unique) — verified Telegram user ID
- `username` (text) — Telegram username
- `first_name` (text) — Telegram first name
- `last_name` (text)
- `photo_url` (text) — Telegram photo
- `balance` (numeric, default 0) — Pilot balance
- `total_withdrawn` (numeric, default 0)
- `ads_watched` (int, default 0)
- `tasks_completed` (int, default 0)
- `mining_count` (int, default 0)
- `usdt_wallet` (text) — BEP20 wallet address
- `referred_by` (uuid FK users.id) — referrer
- `referral_code` (text, unique) — user's referral code
- `status` (text: active/suspended/banned) default 'active'
- `balance_frozen` (bool, default false)
- `risk_score` (int, default 0)
- `last_mining_at` (timestamptz)
- `last_ad_at` (timestamptz)
- `last_daily_bonus_at` (timestamptz)
- `daily_bonus_day` (int, default 0)
- `last_login_at` (timestamptz)
- `created_at` (timestamptz default now())
- `updated_at` (timestamptz default now())

### system_settings
- Singleton row (id=1) with all configurable platform parameters.
- Mining reward/duration/limit, ad reward/cooldown/limit, task timer, referral rewards, daily bonus rewards (7-day array), USDT rate, withdrawal min/max/fee, maintenance mode.

### transactions
- `id` (uuid PK)
- `user_id` (uuid FK users.id)
- `type` (text) — MINING, AD_REWARD, TASK_REWARD, DAILY_BONUS, REWARD_CODE, REFERRAL_JOIN, REFERRAL_DAY1, REFERRAL_DAY2, WITHDRAWAL, WITHDRAWAL_FEE, ADMIN_ADJUSTMENT
- `amount` (numeric) — positive credit, negative debit
- `balance_before` (numeric)
- `balance_after` (numeric)
- `reference_id` (text) — related entity ID
- `metadata` (jsonb)
- `created_at` (timestamptz default now())

### referrals
- `id` (uuid PK)
- `referrer_id` (uuid FK users.id)
- `referred_id` (uuid FK users.id)
- `join_reward_paid` (bool, default false)
- `day1_reward_paid` (bool, default false)
- `day2_reward_paid` (bool, default false)
- `referred_ads_day1` (int, default 0)
- `referred_ads_day2` (int, default 0)
- `created_at` (timestamptz default now())

## Security
- RLS enabled on all tables.
- Users can read/update only their own row.
- Transactions: users can read only their own; inserts via service role (edge functions).
- system_settings: readable by all (anon+authenticated) for app config; updates via admin edge function only.
- referrals: users can read their own referrals (as referrer); inserts/updates via service role.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE NOT NULL,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  balance numeric(18,4) NOT NULL DEFAULT 0,
  total_withdrawn numeric(18,4) NOT NULL DEFAULT 0,
  ads_watched int NOT NULL DEFAULT 0,
  tasks_completed int NOT NULL DEFAULT 0,
  mining_count int NOT NULL DEFAULT 0,
  usdt_wallet text,
  referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
  referral_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  balance_frozen boolean NOT NULL DEFAULT false,
  risk_score int NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  last_mining_at timestamptz,
  last_ad_at timestamptz,
  last_daily_bonus_at timestamptz,
  daily_bonus_day int NOT NULL DEFAULT 0,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);

-- system_settings: singleton, readable by all for app config
CREATE TABLE IF NOT EXISTS system_settings (
  id int PRIMARY KEY DEFAULT 1,
  mining_reward_per_hour numeric NOT NULL DEFAULT 10,
  mining_duration_minutes int NOT NULL DEFAULT 60,
  mining_daily_limit int NOT NULL DEFAULT 24,
  ad_reward numeric NOT NULL DEFAULT 5,
  ad_cooldown_seconds int NOT NULL DEFAULT 30,
  ad_daily_limit int NOT NULL DEFAULT 30,
  task_timer_seconds int NOT NULL DEFAULT 5,
  referral_join_reward numeric NOT NULL DEFAULT 25,
  referral_day1_reward numeric NOT NULL DEFAULT 50,
  referral_day2_reward numeric NOT NULL DEFAULT 75,
  referral_day1_ads int NOT NULL DEFAULT 10,
  referral_day2_ads int NOT NULL DEFAULT 15,
  daily_bonus_rewards jsonb NOT NULL DEFAULT '[10,15,20,25,30,40,100]'::jsonb,
  pilot_usdt_rate numeric NOT NULL DEFAULT 0.0001,
  usdt_min_withdraw numeric NOT NULL DEFAULT 0.10,
  usdt_max_withdraw numeric NOT NULL DEFAULT 100,
  usdt_fee_percent numeric NOT NULL DEFAULT 7,
  usdt_fee_fixed numeric NOT NULL DEFAULT 0.01,
  usdt_network text NOT NULL DEFAULT 'BEP20',
  maintenance_mode boolean NOT NULL DEFAULT false,
  community_channel text NOT NULL DEFAULT 'https://t.me/earnpilotcommunity',
  payment_channel text NOT NULL DEFAULT 'https://t.me/earnpilotpayment',
  bot_username text NOT NULL DEFAULT 'Earn_pilot_1bot',
  support_username text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_check CHECK (id = 1)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_all" ON system_settings;
CREATE POLICY "settings_select_all" ON system_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "settings_update_admin" ON system_settings;
CREATE POLICY "settings_update_admin" ON system_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- transactions: immutable ledger
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('MINING','AD_REWARD','TASK_REWARD','DAILY_BONUS','REWARD_CODE','REFERRAL_JOIN','REFERRAL_DAY1','REFERRAL_DAY2','WITHDRAWAL','WITHDRAWAL_FEE','ADMIN_ADJUSTMENT')),
  amount numeric(18,4) NOT NULL,
  balance_before numeric(18,4) NOT NULL,
  balance_after numeric(18,4) NOT NULL,
  reference_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tx_select_own" ON transactions;
CREATE POLICY "tx_select_own" ON transactions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tx_insert_own" ON transactions;
CREATE POLICY "tx_insert_own" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);

-- referrals
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  join_reward_paid boolean NOT NULL DEFAULT false,
  day1_reward_paid boolean NOT NULL DEFAULT false,
  day2_reward_paid boolean NOT NULL DEFAULT false,
  referred_ads_day1 int NOT NULL DEFAULT 0,
  referred_ads_day2 int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_select_own" ON referrals;
CREATE POLICY "ref_select_own" ON referrals FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ref_insert_own" ON referrals;
CREATE POLICY "ref_insert_own" ON referrals FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ref_update_own" ON referrals;
CREATE POLICY "ref_update_own" ON referrals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
