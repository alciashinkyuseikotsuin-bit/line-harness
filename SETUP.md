# LINE Harness セットアップ手順

## 全体の流れ

1. Supabase でデータベース作成
2. LINE Developers で Messaging API 設定
3. Vercel にデプロイ
4. LINE Developers に Webhook URL を設定

---

## Step 1: Supabase（データベース）

1. https://supabase.com にアクセスしてアカウント作成（無料）
2. 「New Project」でプロジェクト作成
   - Organization: 自分の組織を選択
   - Project name: `line-harness`
   - Database Password: 安全なパスワードを設定
   - Region: `Northeast Asia (Tokyo)` を選択
3. プロジェクトが作成されたら **SQL Editor** を開く
4. `supabase-schema.sql` の内容をコピペして「Run」
5. **Settings > API** から以下をメモ:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2: LINE Developers（LINE連携）

1. https://developers.line.biz にLINEビジネスIDでログイン
2. プロバイダーを作成（または既存を選択）
3. 「Messaging API」チャネルを作成
   - 既に公式アカウントがあれば「Messaging APIを利用する」を選択
4. 以下をメモ:
   - **チャネル基本設定 > Channel Secret** → `LINE_CHANNEL_SECRET`
   - **Messaging API設定 > Channel Access Token**（発行ボタン押す）→ `LINE_CHANNEL_ACCESS_TOKEN`
5. **Messaging API設定** で以下を変更:
   - 応答メッセージ: **オフ**
   - Webhook: **オン**
   - Webhook URL: Step 4 で設定

---

## Step 3: Vercel にデプロイ

1. https://vercel.com にGitHubアカウントでログイン
2. 「Import Project」→ GitHubの `line-harness` リポジトリを選択
3. **Environment Variables** に以下を入力:

| 変数名 | 値 |
|--------|-----|
| `LINE_CHANNEL_ACCESS_TOKEN` | Step 2 でメモした値 |
| `LINE_CHANNEL_SECRET` | Step 2 でメモした値 |
| `NEXT_PUBLIC_SUPABASE_URL` | Step 1 でメモした値 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 1 でメモした値 |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 1 でメモした値 |

4. 「Deploy」ボタンを押す
5. デプロイ完了後、URLをメモ（例: `https://line-harness.vercel.app`）

---

## Step 4: Webhook URL を設定

1. LINE Developers に戻る
2. **Messaging API設定 > Webhook URL** に以下を入力:
   ```
   https://あなたのVercel URL/api/webhook
   ```
   例: `https://line-harness.vercel.app/api/webhook`
3. 「検証」ボタンを押して成功を確認
4. **Webhookの利用: オン** になっていることを確認

---

## 完了！

これで LINE 公式アカウントと管理画面が連携されます。

### 動作確認
- LINEで公式アカウントを友だち追加 → 管理画面の友だち一覧に表示される
- 管理画面からアンケート作成 → LINE配信 → 回答でセグメント分け → セグメント別配信
