-- アンケートの送信総数を保持（回答率計算用）
-- 本配信のたびに +配信対象人数 が加算される

ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0;
