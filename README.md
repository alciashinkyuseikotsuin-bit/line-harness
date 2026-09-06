This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 送信ゲートのDB設定

LINE送信制御を有効にする前に、Supabase SQL Editorで `migrations/009_send_gate.sql` を手動実行してください。未設定の送信モードは安全側の `off` です。緊急時は `LINE_SEND_MODE=off` を環境変数に設定するとDB設定より優先して全送信を止められます。

- `009_send_gate.sql` は自動適用されません。設定保存には、このSQLが作成する `set_global_send_gate_settings` 関数も必要です。モードと11トグルを1トランザクションで更新し、migration 007以降の `account_id IS NULL` 行の重複作成を防ぎます。007以前のスキーマにも対応します。
- `/settings` の先頭に送信制御があります。未設定は `off`・全機能OFFです。`test_only` は「テスト配信」タグの友だちへの単独pushのみ許可し、multicast・broadcastは常に停止します。機能別トグルは `on` の場合だけ使います。
- 有効な `LINE_SEND_MODE` はDB値より優先され、保存済みモードと実効モードは別表示されます。不正な環境変数値は無視します。
- スキップは `messages` に記録せず、コンソールと `send_gate_log` に記録します。ステップはスキップでも次へ進み、予約配信も処理済みにして、再開時の再送待ちを作りません。送信数は実送信分だけを数えます。
- `npm test` はLINE SDKとSupabaseをモック化したユニットテストです。実際のLINE API・DBには接続しません。検証コマンドは `npm test`、`npm run lint`、`LINE_SEND_MODE=off npm run build` です。

## キーワード自動応答と cron の追加設定

`migrations/010_keyword_exact_and_cascade.sql` は自動適用されません。Supabase SQL Editorで手動実行してください。このマイグレーションは、`active=true` かつ `match_type='partial'` で、キーワード配列に完全な `広告` を含む行、または小文字化して `line` となるキーワードを含む行だけを完全一致に変更します。実際の対象行数は本番データに依存し、2件になるとは限りません。対象外の行の `match_type` と、全行の `keywords`・`active`・`add_tags`・`points` は変更しません。実行後、管理画面の `/engage/replies` で「広告」と「LINE,line」の2件が「完全一致」になっていることを目視確認してください。

同マイグレーションは `cascade` を追加し、既存を含む全自動応答の既定を `false` にします。`cascade` がオフの応答は返信本文だけを送り、タグ付与・ポイント付与・ステップ配信登録は行いません。必要な応答だけ管理画面で「連動」をオンにしてください。

`CRON_SECRET` をVercelプロジェクトの環境変数に設定すると、予約配信・ステップ配信のcronエンドポイントは `Authorization: Bearer $CRON_SECRET` を要求します。Vercel CronからのGETリクエストにはこのヘッダーが自動付与され、正しいヘッダーがない実行はGET・POSTともにブロックされます。設定は Vercel Dashboard → Settings → Environment Variables から行います。未設定時は従来どおり認証なしで動作します。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
