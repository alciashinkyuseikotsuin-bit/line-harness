# SPEC: LINE送信ゲート実装（フェーズ2: キーワード応答の改善＋cron保護）

## 前提

フェーズ1（`SPEC_SEND_GATE.md`）は実装・レビュー済みで、`src/lib/line.ts` の送信ゲート（`gateSend`, `SendFeature`）が入っている。このフェーズはその上に追加で以下を実装する。フェーズ1で作った送信ゲートの挙動には触れない（`gateSend` 自体の変更は不要）。

必読: `/Users/horiyuusuke/Desktop/コンサル知識の湖/ほり先生の月商300万プロジェクト/YouTubeチャンネル/素材/line-harness送信経路安全監査_2026-09-06.md` の5節「キーワード自動応答の対象範囲」。

## 現状（実装前に必ず確認すること）

- `src/lib/engage.ts` の `findAutoReply`:
  - `auto_replies.match_type` は既に `'exact' | 'partial'` の2値を持つ（`migrations/006_crm_engagement.sql:103` の CHECK 制約）。`exact` は既に実装されている（`normalized === k`）。
  - 正規化は `text.trim().toLowerCase()` のみ。**全角英数字・全角スペースは半角化されない**。そのため監査レポートが指摘する通り、全角「ＬＩＮＥ」等は `exact` でも `partial` でもマッチしない不整合がある。
  - `once_per_friend` は既にある。
- `auto_replies` テーブルに `cascade` 相当のカラムは無い。`add_tags` と `points` は常に反応時に実行される（`src/app/api/webhook/route.ts` のキーワード応答ブロック、903-936行目付近）。
- 管理画面の新規作成フォーム（`src/app/(dashboard)/engage/replies/page.tsx:36`）は `match_type` のデフォルトが `partial`。

## 1. 正規化の強化（全角/半角）

`src/lib/engage.ts` に正規化関数を追加し、`findAutoReply` の受信テキスト側・キーワード側の両方に適用する（`exact`・`partial` 両方の判定で使う。既存の `.trim().toLowerCase()` は残しつつ、その前後に全角→半角変換を挟む形でよい）。

```ts
/** 全角英数字・全角スペースを半角化し、前後空白を除去して小文字化する */
export function normalizeForMatch(text: string): string {
  const halfWidth = text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  ).replace(/　/g, " ");
  return halfWidth.trim().toLowerCase();
}
```

（カタカナ「ライン」→ 半角「line」への変換のような同義語展開は行わない。半角/全角と大文字/小文字の正規化のみが今回のスコープ。）

`findAutoReply` 内の `normalized` と `kw` の生成をこの関数に置き換える。既存のユニットテストがあれば壊さないこと（無ければ `tests/` に追加してよい: 全角「ＬＩＮＥ」で `line` キーワードにマッチすること、半角と全角混在でもマッチすること）。

## 2. 既存2件のマッチタイプ切り替え

キーワードに `広告` を含む、または `LINE`/`line` を含む**現在 `active=true` の** `auto_replies` 行を `match_type='exact'` に切り替えるマイグレーション `migrations/010_keyword_exact_and_cascade.sql` を作成する。

```sql
UPDATE auto_replies
SET match_type = 'exact', updated_at = NOW()
WHERE active = true
  AND match_type = 'partial'
  AND (
    '広告' = ANY(keywords)
    OR EXISTS (SELECT 1 FROM unnest(keywords) k WHERE lower(k) IN ('line'))
  );
```

**他の11件（無効設定含む）の `match_type` / `keywords` / `active` / `add_tags` / `points` には一切触れないこと。** このUPDATEが対象にした行数が2件になるとは限らない（本番データを見ていないため）ことをREADME等に明記し、**マイグレーション実行後に管理画面（`/engage/replies`）で「広告」「LINE,line」の2件が実際に「完全一致」になっているかを目視確認する手順**をREADMEに残すこと（このフェーズの完了条件には「実際にSupabaseで確認した」は含まれない＝コードとマイグレーションの提供までが範囲。確認作業はデプロイ後に人間が行う）。

管理画面の新規作成フォームのデフォルトも `partial` → `exact` に変更する（`src/app/(dashboard)/engage/replies/page.tsx:36`）。今後新しく作る自動応答が誤爆しにくいデフォルトにするため。既存のUIの「部分一致」選択肢自体は残す（削除しない。使いたい時に選べるようにする）。

## 3. `cascade` フラグの追加（1キーワード＝1通の既定化）

`migrations/010_keyword_exact_and_cascade.sql` に以下も追加する:

```sql
ALTER TABLE auto_replies ADD COLUMN IF NOT EXISTS cascade BOOLEAN NOT NULL DEFAULT FALSE;
```

**新規カラムなのでデフォルト値により既存の全13件（有効・無効問わず）が `cascade=false` になる。これは意図した変更**（「1キーワード＝1通」を安全側の既定にするという今回の目的そのもの）。無効な11件は元々 `active=false` で反応しないため実害はない。有効な2件（「広告」「LINE,line」）は、このフェーズのデプロイ後、**`add_tags` によるステップ配信登録や `points` 付与が自動では発火しなくなる**（返信メッセージ自体は今まで通り送られる）。これは仕様通りであり、必要であれば管理画面で `cascade` をONにすれば元の動作に戻せる。

### 実装箇所

- `src/lib/engage.ts` の `AutoReply` 型に `cascade: boolean` を追加。
- `src/app/api/webhook/route.ts` のキーワード自動応答ブロック（`autoReply` がマッチした後の `add_tags` によるタグ付与＋`enrollMatchingStepFlows` 呼び出し、および `points>0` の `awardPoints` 呼び出し）を、**`autoReply.cascade === true` の場合のみ実行する**ように条件を追加する。`cascade` が false または未定義の場合は、返信メッセージ（`pushMessage` 本文）だけを送り、タグ付与・ポイント付与・ステップ配信登録は一切行わない。
- `src/app/api/auto-replies/route.ts`（POST）と `src/app/api/auto-replies/[id]/route.ts`（PUT）に `cascade` の読み書きを追加する（`body.cascade` を boolean に正規化して insert/update に含める。未指定時は `false`）。
- `src/app/(dashboard)/engage/replies/page.tsx` に `cascade` のチェックボックスをフォームへ追加する。ラベル例:「タグ付与・ポイント付与・ステップ配信も連動させる（オフ推奨: オンにすると1回の反応で複数通に増える場合があります）」。一覧表示にも現在の状態が分かるバッジを出す（例:「連鎖あり」）。デフォルトはOFF（未チェック）。

## 4. cronエンドポイントの保護

対象: `src/app/api/broadcast/process/route.ts`、`src/app/api/step-flows/process/route.ts`。

- 環境変数 `CRON_SECRET` が設定されている場合のみ、リクエストの `Authorization: Bearer <CRON_SECRET>` ヘッダーを検証する。一致しなければ `401` を返し、処理を実行しない。
- `CRON_SECRET` が未設定の場合は**現状維持**（検証なしで実行。今と同じ挙動）。これは今すぐ全員に強制させず、ボスが後から設定できるようにするため。
- 両エンドポイントとも `GET`/`POST` 両方に同じ検証をかける（Vercel cronはGETで叩く。手動確認等でPOSTも叩けるようになっているため両方に必要）。
- 共通化のため `src/lib/cron-auth.ts` のような小さいヘルパーを作ってよい:

```ts
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未設定なら検証しない（現状維持）
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}
```

- 検証失敗時のレスポンスは `NextResponse.json({ error: "unauthorized" }, { status: 401 })`。
- `src/proxy.ts` の `PUBLIC_PREFIXES` はそのまま（`/api/broadcast/process`, `/api/step-flows/process` は今後も公開のままでよい。認証はエンドポイント内で行う）。
- Vercel側の設定: Vercel CronはGETリクエストに自動で `Authorization: Bearer $CRON_SECRET` ヘッダーを付与する仕様（Vercelのドキュメント上の標準機能）。README に「Vercelプロジェクトの環境変数に `CRON_SECRET` を設定すると、Vercel Cronからのリクエストにこのヘッダーが自動付与され、それ以外からの実行はブロックされます。設定手順: Vercel Dashboard → Settings → Environment Variables」という趣旨の説明を追記すること。
- ユニットテストを追加: `CRON_SECRET` 設定時に不正な/欠落した Authorization ヘッダーでは401になり、DBへの副作用（送信・ステータス更新）が一切発生しないこと。`CRON_SECRET` 未設定時は従来通り実行されること。

## 5. 安全ルール（フェーズ1と同じ）

- 実装・テスト中に実際のLINE APIを呼ばないこと。フェーズ1のモック方式（vitest + `@line/bot-sdk` モック）をそのまま使う。
- `npm run build`, `npm run lint`, `npm test` が通ること。
- まだ `git commit` はしない（レビュー後にこちらでコミットする）。

## 完了条件（フェーズ2）

1. `normalizeForMatch` が実装され、全角/半角の不整合が解消されている
2. `migrations/010_keyword_exact_and_cascade.sql` が作成され、既存2件のmatch_type切り替えと `cascade` カラム追加を行う
3. `cascade` がfalseの自動応答は、返信本文以外（タグ・ポイント・ステップ配信）を一切発火させない
4. 管理画面で `cascade` の編集ができる
5. cronエンドポイント2つが `CRON_SECRET` 設定時のみ認証を要求し、未設定時は現状維持
6. ユニットテストが追加され、`npm test` が通る
7. `npm run build` が型エラーなく通る

作業が終わったら、変更ファイル一覧と、マイグレーションのUPDATE文が対象とする行の絞り込み条件（誤って他の設定を巻き込まない根拠）を最後のメッセージで報告すること。
