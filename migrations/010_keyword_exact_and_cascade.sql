-- 010: キーワード自動応答の安全な既定値
-- Supabase SQL Editor で手動実行してください。

UPDATE auto_replies
SET match_type = 'exact', updated_at = NOW()
WHERE active = true
  AND match_type = 'partial'
  AND (
    '広告' = ANY(keywords)
    OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE lower(k) IN ('line'))
  );

ALTER TABLE auto_replies
  ADD COLUMN IF NOT EXISTS cascade BOOLEAN NOT NULL DEFAULT FALSE;
