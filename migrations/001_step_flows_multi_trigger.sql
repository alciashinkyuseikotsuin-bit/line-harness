-- step_flows に複数トリガータグ対応カラムを追加
-- Supabase SQL Editor で1回だけ実行してください

-- 1. 新しいカラム追加
ALTER TABLE step_flows
  ADD COLUMN IF NOT EXISTS trigger_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trigger_match_mode TEXT NOT NULL DEFAULT 'any'
    CHECK (trigger_match_mode IN ('any', 'all'));

-- 2. trigger_tag を NULL 許容に変更（旧データは残しつつ、新規作成では使わない）
ALTER TABLE step_flows
  ALTER COLUMN trigger_tag DROP NOT NULL;

-- 3. 既存データを trigger_tags に移行
UPDATE step_flows
SET trigger_tags = ARRAY[trigger_tag]
WHERE trigger_tag IS NOT NULL
  AND trigger_tag <> ''
  AND (trigger_tags IS NULL OR cardinality(trigger_tags) = 0);

-- 4. tag マッチ高速化のためのGINインデックス
CREATE INDEX IF NOT EXISTS idx_step_flows_trigger_tags
  ON step_flows USING GIN(trigger_tags);
