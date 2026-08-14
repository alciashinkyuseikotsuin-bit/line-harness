-- 008: 新規登録ウェルカムフロー＆2日目アンケート対応
-- Supabase SQL Editor で1回だけ実行してください（何度実行しても安全な書き方です）

-- 1. surveys に「ステップ配信専用」フラグを追加
--    step_only = TRUE のアンケートは、一斉配信・セグメント配信・予約配信・
--    友だち追加直後の自動送信では絶対に送られない（ステップ配信のブロックからのみ送信可能）
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS step_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 「1分サロン診断」をステップ配信専用に設定（新規登録者の2日目にだけ流す）
UPDATE surveys
SET step_only = TRUE
WHERE id = 'c94560bb-4898-40be-a0a7-4b880be8d51d';

-- 3. 友だち追加トリガー用のタグをタグマスタに登録（メインアカウント）
INSERT INTO tags (name, account_id)
SELECT '友だち追加', '0c972a74-b3c2-40da-85e2-324637e424af'
WHERE NOT EXISTS (
  SELECT 1 FROM tags
  WHERE name = '友だち追加'
    AND account_id = '0c972a74-b3c2-40da-85e2-324637e424af'
);
