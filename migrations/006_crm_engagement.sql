-- ============================================================
-- 006: CRM・エンゲージメント基盤
-- 顧客カルテ / メッセージログ / 行動イベント / ポイント /
-- キーワード自動応答 / おみくじ / 診断 / リンク計測 / AI分析
-- Supabase SQL Editor で1回だけ実行してください
-- ============================================================

-- ===========================
-- 1. friends 拡張（顧客カルテ用）
-- ===========================
ALTER TABLE friends
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT '新規',
  ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_score INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pending_input JSONB;

-- 過去に手動追加済みの可能性があるカラムの保険
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS message_blocks JSONB;

-- ===========================
-- 2. メッセージログ（送受信すべて記録）
-- ===========================
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  -- source: webhook / auto_reply / omikuji / survey / diagnosis / broadcast / step / manual / reward / system
  source TEXT NOT NULL DEFAULT 'webhook',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_friend_created
  ON messages(friend_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

-- ===========================
-- 3. 行動イベントログ（分析の土台）
-- ===========================
CREATE TABLE IF NOT EXISTS friend_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  -- event_type: follow / unfollow / message / survey_answer / survey_complete /
  --             diagnosis_complete / link_click / keyword_reply / omikuji /
  --             points / reward / stage_change / manual_message / ai_analyzed
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_friend_created
  ON friend_events(friend_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON friend_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON friend_events(created_at DESC);

-- ===========================
-- 4. ポイント履歴・特典
-- ===========================
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_friend ON point_transactions(friend_id, created_at DESC);

CREATE TABLE IF NOT EXISTS point_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold INT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  add_tag TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS point_reward_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_id UUID REFERENCES point_rewards(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reward_id, friend_id)
);

-- ===========================
-- 5. キーワード自動応答
-- ===========================
CREATE TABLE IF NOT EXISTS auto_replies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  match_type TEXT NOT NULL DEFAULT 'partial' CHECK (match_type IN ('exact', 'partial')),
  reply_text TEXT NOT NULL,
  add_tags TEXT[] NOT NULL DEFAULT '{}',
  points INT NOT NULL DEFAULT 0,
  -- once_per_friend: 同じ友だちには1回だけ反応（隠しワードキャンペーン用）
  once_per_friend BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- 6. おみくじ
-- ===========================
CREATE TABLE IF NOT EXISTS omikuji_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fortune TEXT NOT NULL,          -- 大吉・中吉・小吉 など
  message TEXT NOT NULL,          -- 本文（経営ワンポイント等）
  weight INT NOT NULL DEFAULT 1,  -- 抽選の重み
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS omikuji_draws (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  item_id UUID REFERENCES omikuji_items(id) ON DELETE SET NULL,
  drawn_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(friend_id, drawn_on)
);

-- ===========================
-- 7. 診断コンテンツ（アンケートエンジンを拡張）
-- ===========================
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS survey_type TEXT NOT NULL DEFAULT 'survey';
-- 既存の CHECK 制約はないので新規追加（IF NOT EXISTS 相当の書き方）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'surveys_survey_type_check'
  ) THEN
    ALTER TABLE surveys
      ADD CONSTRAINT surveys_survey_type_check
      CHECK (survey_type IN ('survey', 'diagnosis'));
  END IF;
END $$;

ALTER TABLE survey_choices
  ADD COLUMN IF NOT EXISTS diagnosis_points JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS diagnosis_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL,         -- タイプ識別子（例: 攻め型）
  title TEXT NOT NULL,            -- 結果タイトル
  result_message TEXT NOT NULL,   -- 結果本文
  add_tag TEXT,                   -- 付与タグ
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(survey_id, type_key)
);

-- ===========================
-- 8. リンククリック計測
-- ===========================
CREATE TABLE IF NOT EXISTS tracked_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,      -- 短いコード（URL用）
  name TEXT NOT NULL,
  dest_url TEXT NOT NULL,
  add_tag TEXT,
  points INT NOT NULL DEFAULT 0,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID REFERENCES tracked_links(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES friends(id) ON DELETE SET NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_link_clicks_friend ON link_clicks(friend_id);

-- ===========================
-- 9. アプリ設定（ポイント付与ルール等）
-- ===========================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ポイント付与ルールの初期値
INSERT INTO app_settings (key, value) VALUES
  ('point_rules', '{"survey_answer": 5, "survey_complete": 10, "link_click": 3, "omikuji": 2, "daily_message": 1, "keyword_default": 0}')
ON CONFLICT (key) DO NOTHING;

-- ===========================
-- 10. RLS
-- ===========================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE omikuji_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE omikuji_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnosis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'messages','friend_events','point_transactions','point_rewards',
    'point_reward_claims','auto_replies','omikuji_items','omikuji_draws',
    'diagnosis_results','tracked_links','link_clicks','app_settings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_all" ON %I FOR ALL USING (true) WITH CHECK (true)', t
      );
    END IF;
  END LOOP;
END $$;

-- ===========================
-- 11. おみくじ初期データ（サンプル・編集自由）
-- ===========================
INSERT INTO omikuji_items (fortune, message, weight)
SELECT * FROM (VALUES
  ('大吉', '今日は攻めの日！💪 新メニューの告知や単価アップの提案、思い切って出してみましょう。迷ったら「お客様に一番喜ばれること」を選べば外しません。', 1),
  ('中吉', '安定の運気✨ 今日は既存のお客様へのフォローが吉。最近来ていないお客様に一言LINEを送るだけで、再来店の種になります。', 2),
  ('小吉', 'コツコツ運🌱 今日は仕込みの日。口コミへの返信、写真の撮り溜め、メニュー表の見直し…地味な作業が来月の売上を作ります。', 3),
  ('吉', 'ひらめき運🌟 お客様との会話の中に次のヒットメニューのヒントが眠っています。今日は「最近どうですか？」を口癖にしてみて。', 3),
  ('末吉', '充電日☕ 頑張りすぎ注意。自分のケアも仕事のうちです。1つだけ「明日やること」を決めて、今日は早めに休みましょう。', 2)
) AS v(fortune, message, weight)
WHERE NOT EXISTS (SELECT 1 FROM omikuji_items);
