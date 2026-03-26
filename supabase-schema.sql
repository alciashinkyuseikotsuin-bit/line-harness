-- LINE Harness データベーススキーマ
-- Supabase の SQL Editor で実行してください

-- ===========================
-- 友だち (LINE ユーザー)
-- ===========================
CREATE TABLE friends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  picture_url TEXT,
  status_message TEXT,
  tags TEXT[] DEFAULT '{}',
  is_blocked BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_friends_line_user_id ON friends(line_user_id);
CREATE INDEX idx_friends_tags ON friends USING GIN(tags);

-- ===========================
-- アンケート
-- ===========================
CREATE TABLE surveys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- アンケートの質問
-- ===========================
CREATE TABLE survey_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_questions_survey ON survey_questions(survey_id);

-- ===========================
-- 選択肢 (タグ・配信メッセージ付き)
-- ===========================
CREATE TABLE survey_choices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  tag TEXT NOT NULL,
  broadcast_message TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_choices_question ON survey_choices(question_id);

-- ===========================
-- アンケート回答
-- ===========================
CREATE TABLE survey_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID REFERENCES surveys(id) ON DELETE CASCADE,
  question_id UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
  choice_id UUID REFERENCES survey_choices(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  responded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_responses_survey ON survey_responses(survey_id);
CREATE INDEX idx_responses_friend ON survey_responses(friend_id);
CREATE UNIQUE INDEX idx_responses_unique ON survey_responses(friend_id, question_id);

-- ===========================
-- 配信履歴
-- ===========================
CREATE TABLE broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message_text TEXT NOT NULL,
  target_type TEXT DEFAULT 'all' CHECK (target_type IN ('all', 'segment', 'survey')),
  target_tags TEXT[] DEFAULT '{}',
  target_survey_id UUID REFERENCES surveys(id),
  target_choice_id UUID REFERENCES survey_choices(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- RLS (Row Level Security) ポリシー
-- ※ 管理画面なので service_role_key 使用時は不要
-- ===========================
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

-- service_role_key で全操作可能にするポリシー
CREATE POLICY "service_role_all" ON friends FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON surveys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON survey_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON survey_choices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON survey_responses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON broadcasts FOR ALL USING (true) WITH CHECK (true);

-- ===========================
-- ステップ配信フロー
-- ===========================
CREATE TABLE step_flows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_tag TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================
-- ステップ配信メッセージ
-- ===========================
CREATE TABLE step_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID REFERENCES step_flows(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_step_messages_flow ON step_messages(flow_id);

-- ===========================
-- ステップ配信登録（友だちごとの進行状況）
-- ===========================
CREATE TABLE step_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID REFERENCES step_flows(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES friends(id) ON DELETE CASCADE,
  current_step INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollments_flow ON step_enrollments(flow_id);
CREATE INDEX idx_enrollments_friend ON step_enrollments(friend_id);
CREATE INDEX idx_enrollments_next_send ON step_enrollments(next_send_at);
CREATE UNIQUE INDEX idx_enrollments_unique ON step_enrollments(flow_id, friend_id);

-- RLS for new tables
ALTER TABLE step_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON step_flows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON step_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON step_enrollments FOR ALL USING (true) WITH CHECK (true);
