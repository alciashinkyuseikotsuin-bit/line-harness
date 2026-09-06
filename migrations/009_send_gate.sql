-- 送信ゲートのスキップ記録。Supabase SQL Editor で手動実行してください。
CREATE TABLE IF NOT EXISTS send_gate_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL, reason TEXT NOT NULL, send_mode TEXT NOT NULL,
  recipient_line_user_id TEXT, recipient_count INT,
  friend_id UUID REFERENCES friends(id) ON DELETE SET NULL,
  preview TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_send_gate_log_created ON send_gate_log(created_at DESC);
ALTER TABLE send_gate_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'send_gate_log' AND policyname = 'service_role_all') THEN
    CREATE POLICY "service_role_all" ON send_gate_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- app_settings(account_id,key) allows duplicate NULL account ids.  Serialize a global
-- update by advisory lock so send-gate configuration always has one NULL-account row.
CREATE OR REPLACE FUNCTION set_global_send_gate_settings(mode_value JSONB, toggles_value JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('global_send_gate_settings'));
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'account_id') THEN
    UPDATE app_settings SET value = mode_value WHERE key = 'send_mode' AND account_id IS NULL;
    IF NOT FOUND THEN INSERT INTO app_settings(key, value, account_id) VALUES('send_mode', mode_value, NULL); END IF;
    UPDATE app_settings SET value = toggles_value WHERE key = 'send_feature_toggles' AND account_id IS NULL;
    IF NOT FOUND THEN INSERT INTO app_settings(key, value, account_id) VALUES('send_feature_toggles', toggles_value, NULL); END IF;
  ELSE
    INSERT INTO app_settings(key, value) VALUES('send_mode', mode_value)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    INSERT INTO app_settings(key, value) VALUES('send_feature_toggles', toggles_value)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION set_global_send_gate_settings(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_global_send_gate_settings(JSONB, JSONB) TO service_role;
