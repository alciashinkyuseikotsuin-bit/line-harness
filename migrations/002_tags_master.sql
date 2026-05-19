-- タグマスタテーブル
-- 友だちに付与されていないタグも管理画面で作成・選択できるようにする
-- friends.tags TEXT[] とは独立して存在。アプリ側で union して候補として扱う

CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON tags;
CREATE POLICY "service_role_all" ON tags FOR ALL USING (true) WITH CHECK (true);

-- 既存の friends.tags から見つかるタグをすべてマスタに事前登録（重複は無視）
INSERT INTO tags (name)
SELECT DISTINCT unnest(tags) AS name
FROM friends
WHERE tags IS NOT NULL AND cardinality(tags) > 0
ON CONFLICT (name) DO NOTHING;
