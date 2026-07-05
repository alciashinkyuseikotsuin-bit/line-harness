-- ============================================================
-- 007: マルチアカウント対応
-- 複数のLINE公式アカウントを1つの管理画面で切り替えて運用する
-- Supabase SQL Editor で1回だけ実行してください
-- ============================================================

-- ===========================
-- 1. LINEアカウントテーブル
-- token/secret が空文字の行は「環境変数を使うメインアカウント」
-- ===========================
CREATE TABLE IF NOT EXISTS line_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  channel_access_token TEXT NOT NULL DEFAULT '',
  channel_secret TEXT NOT NULL DEFAULT '',
  -- Bot自身のuserId（webhookのdestination）。初回受信時に自動学習する
  destination_user_id TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE line_accounts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'line_accounts' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON line_accounts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- メインアカウント行（既存運用の引き継ぎ先）
INSERT INTO line_accounts (name, is_default)
SELECT 'メインアカウント', TRUE
WHERE NOT EXISTS (SELECT 1 FROM line_accounts);

-- ===========================
-- 2. 各テーブルに account_id を追加して既存データをメインに紐付け
-- ===========================
DO $$
DECLARE
  default_id UUID;
  t TEXT;
BEGIN
  SELECT id INTO default_id FROM line_accounts WHERE is_default LIMIT 1;

  FOREACH t IN ARRAY ARRAY[
    'friends','surveys','broadcasts','step_flows','tags',
    'auto_replies','omikuji_items','point_rewards','tracked_links','app_settings'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES line_accounts(id)', t
    );
    EXECUTE format(
      'UPDATE %I SET account_id = $1 WHERE account_id IS NULL', t
    ) USING default_id;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_account ON %I(account_id)', t, t
    );
  END LOOP;
END $$;

-- ===========================
-- 3. unique制約の張り替え（アカウントごとに一意にする）
-- ===========================
-- friends.line_user_id: 同じ人が複数アカウントの友だちになれるように
ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_line_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_account_line_user
  ON friends(account_id, line_user_id);

-- tags.name: アカウントごとに同名タグを持てるように
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_account_name
  ON tags(account_id, name);

-- app_settings: アカウントごとに設定を持てるように（PK再構成）
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_account_key
  ON app_settings(account_id, key);
