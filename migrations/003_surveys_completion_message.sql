-- アンケートに「全質問回答完了時に送るメッセージ」カラム追加
-- 最後の質問に回答した瞬間にこのテキストを送る

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS completion_message TEXT;
