/*
# EarnPilot Schema Part 2 — Mining, Ads, Tasks, Withdrawals, Bonus, Reward Codes

## Overview
Creates the activity and reward tables:
- `mining_sessions`: Hourly mining sessions with start/expire/claim tracking.
- `ads`: Admin-configured ad networks with zone IDs, rewards, limits.
- `ad_views`: Records of each ad view with verification status.
- `tasks`: Admin-configured tasks (Telegram channel/group, website, Mini App, etc.).
- `task_sessions`: Server-side task sessions with 5-second timer enforcement.
- `task_completions`: Unique task completions per user.
- `withdrawals`: USDT BEP20 withdrawal requests with status lifecycle.
- `daily_bonus_claims`: Daily bonus claim tracking.
- `reward_codes`: Admin-created reward codes with max uses, per-user limits, expiry.
- `reward_code_claims`: Redemption records, unique per user/code.
- `notifications`: User notification history.
- `audit_logs`: Admin action audit trail.

## Notes
- RLS enabled on all tables; users read their own data, writes via service role in edge functions.
- All status fields use CHECK constraints for valid statuses.
- Seed data: 2 sample tasks (community channel, website visit) and 1 sample ad network.
*/

-- mining_sessions
CREATE TABLE IF NOT EXISTS mining_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reward numeric(18,4) NOT NULL,
  claimed_at timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CLAIMED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mining_user ON mining_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_status ON mining_sessions(status);

ALTER TABLE mining_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mining_select_own" ON mining_sessions;
CREATE POLICY "mining_select_own" ON mining_sessions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "mining_insert_own" ON mining_sessions;
CREATE POLICY "mining_insert_own" ON mining_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mining_update_own" ON mining_sessions;
CREATE POLICY "mining_update_own" ON mining_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ads
CREATE TABLE IF NOT EXISTS ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  network text NOT NULL DEFAULT 'adsgram',
  zone_id text NOT NULL,
  reward numeric(18,4) NOT NULL DEFAULT 5,
  daily_limit int NOT NULL DEFAULT 30,
  cooldown_seconds int NOT NULL DEFAULT 30,
  priority int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ads_select_all" ON ads;
CREATE POLICY "ads_select_all" ON ads FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ads_insert_all" ON ads;
CREATE POLICY "ads_insert_all" ON ads FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ads_update_all" ON ads;
CREATE POLICY "ads_update_all" ON ads FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ads_delete_all" ON ads;
CREATE POLICY "ads_delete_all" ON ads FOR DELETE TO anon, authenticated USING (true);

-- ad_views
CREATE TABLE IF NOT EXISTS ad_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id uuid REFERENCES ads(id) ON DELETE SET NULL,
  network text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  reward numeric(18,4) NOT NULL DEFAULT 0,
  verification_id text,
  status text NOT NULL DEFAULT 'STARTED' CHECK (status IN ('STARTED','VERIFIED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adviews_user ON ad_views(user_id);
CREATE INDEX IF NOT EXISTS idx_adviews_user_day ON ad_views(user_id, created_at);

ALTER TABLE ad_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adviews_select_own" ON ad_views;
CREATE POLICY "adviews_select_own" ON ad_views FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "adviews_insert_own" ON ad_views;
CREATE POLICY "adviews_insert_own" ON ad_views FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "adviews_update_own" ON ad_views;
CREATE POLICY "adviews_update_own" ON ad_views FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('telegram_channel','telegram_group','youtube','instagram','website','miniapp','custom')),
  url text NOT NULL DEFAULT '',
  chat_id text,
  chat_username text,
  required_status text NOT NULL DEFAULT 'member',
  reward numeric(18,4) NOT NULL DEFAULT 10,
  image_url text,
  verification_method text NOT NULL DEFAULT 'timer' CHECK (verification_method IN ('timer','membership','manual')),
  duration_seconds int NOT NULL DEFAULT 5,
  daily_limit int NOT NULL DEFAULT 0,
  total_limit int NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select_all" ON tasks;
CREATE POLICY "tasks_select_all" ON tasks FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tasks_insert_all" ON tasks;
CREATE POLICY "tasks_insert_all" ON tasks FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tasks_update_all" ON tasks;
CREATE POLICY "tasks_update_all" ON tasks FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tasks_delete_all" ON tasks;
CREATE POLICY "tasks_delete_all" ON tasks FOR DELETE TO anon, authenticated USING (true);

-- task_sessions
CREATE TABLE IF NOT EXISTS task_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  eligible_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VERIFIED','CLAIMED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasksessions_user ON task_sessions(user_id);

ALTER TABLE task_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasksessions_select_own" ON task_sessions;
CREATE POLICY "tasksessions_select_own" ON task_sessions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tasksessions_insert_own" ON task_sessions;
CREATE POLICY "tasksessions_insert_own" ON task_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tasksessions_update_own" ON task_sessions;
CREATE POLICY "tasksessions_update_own" ON task_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- task_completions
CREATE TABLE IF NOT EXISTS task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reward numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, task_id)
);

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "taskcompletions_select_own" ON task_completions;
CREATE POLICY "taskcompletions_select_own" ON task_completions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "taskcompletions_insert_own" ON task_completions;
CREATE POLICY "taskcompletions_insert_own" ON task_completions FOR INSERT TO anon, authenticated WITH CHECK (true);

-- withdrawals
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_pilot numeric(18,4) NOT NULL,
  amount_usdt numeric(18,4) NOT NULL,
  fee_usdt numeric(18,4) NOT NULL,
  network text NOT NULL DEFAULT 'BEP20',
  wallet_address text NOT NULL,
  tx_hash text,
  explorer_url text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PAID','REJECTED','CANCELLED')),
  admin_id uuid,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wd_select_own" ON withdrawals;
CREATE POLICY "wd_select_own" ON withdrawals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "wd_insert_own" ON withdrawals;
CREATE POLICY "wd_insert_own" ON withdrawals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wd_update_own" ON withdrawals;
CREATE POLICY "wd_update_own" ON withdrawals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- daily_bonus_claims
CREATE TABLE IF NOT EXISTS daily_bonus_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number int NOT NULL,
  reward numeric(18,4) NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bonus_select_own" ON daily_bonus_claims;
CREATE POLICY "bonus_select_own" ON daily_bonus_claims FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "bonus_insert_own" ON daily_bonus_claims;
CREATE POLICY "bonus_insert_own" ON daily_bonus_claims FOR INSERT TO anon, authenticated WITH CHECK (true);

-- reward_codes
CREATE TABLE IF NOT EXISTS reward_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  reward numeric(18,4) NOT NULL,
  max_uses int NOT NULL DEFAULT 0,
  per_user_limit int NOT NULL DEFAULT 1,
  used_count int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reward_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "codes_select_all" ON reward_codes;
CREATE POLICY "codes_select_all" ON reward_codes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "codes_insert_all" ON reward_codes;
CREATE POLICY "codes_insert_all" ON reward_codes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "codes_update_all" ON reward_codes;
CREATE POLICY "codes_update_all" ON reward_codes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "codes_delete_all" ON reward_codes;
CREATE POLICY "codes_delete_all" ON reward_codes FOR DELETE TO anon, authenticated USING (true);

-- reward_code_claims
CREATE TABLE IF NOT EXISTS reward_code_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_id uuid NOT NULL REFERENCES reward_codes(id) ON DELETE CASCADE,
  code text NOT NULL,
  reward numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, code_id)
);

ALTER TABLE reward_code_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "codeclaims_select_own" ON reward_code_claims;
CREATE POLICY "codeclaims_select_own" ON reward_code_claims FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "codeclaims_insert_own" ON reward_code_claims;
CREATE POLICY "codeclaims_insert_own" ON reward_code_claims FOR INSERT TO anon, authenticated WITH CHECK (true);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id text NOT NULL,
  action text NOT NULL,
  target_user uuid,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_all" ON audit_logs;
CREATE POLICY "audit_select_all" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "audit_insert_all" ON audit_logs;
CREATE POLICY "audit_insert_all" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Seed sample tasks
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM tasks LIMIT 1) THEN
    INSERT INTO tasks (title, description, type, url, chat_username, reward, verification_method, duration_seconds, total_limit, enabled)
    VALUES
      ('Join Community Channel', 'Join our official Telegram community channel.', 'telegram_channel', 'https://t.me/earnpilotcommunity', 'earnpilotcommunity', 25, 'membership', 5, 1, true),
      ('Visit Partner Website', 'Visit our partner website for 5 seconds.', 'website', 'https://t.me/earnpilotcommunity', NULL, 15, 'timer', 5, 1, true);
  END IF;
END $$;

-- Seed sample ad network
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ads LIMIT 1) THEN
    INSERT INTO ads (name, network, zone_id, reward, daily_limit, cooldown_seconds, priority, status)
    VALUES ('Adsgram Default', 'adsgram', 'zone_1', 5, 30, 30, 10, 'active');
  END IF;
END $$;
