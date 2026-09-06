# SPEC: LINE送信ゲート実装（フェーズ1: ゲート本体＋モード＋DB＋settings UI）

## 背景・必読

このリポジトリの送信経路を監査したレポートが以下にある。**着手前に必ず読むこと**:

`/Users/horiyuusuke/Desktop/コンサル知識の湖/ほり先生の月商300万プロジェクト/YouTubeチャンネル/素材/line-harness送信経路安全監査_2026-09-06.md`

要点:
- LINE Messaging API を実際に叩く低レベル関数は `src/lib/line.ts` に7つだけ（`broadcastMessage`, `broadcastMessages`, `pushMessage`, `pushMessages`, `multicastMessage`, `multicastMessages`, `sendSurveyMessage`）。narrowcast・replyMessage は未使用。
- 既存のスイッチ `AUTO_RESPONSES_DISABLED`（`src/app/api/webhook/route.ts:15`）は webhook 内のローカルラッパー（同ファイル17-41行）にしか効いておらず、ステップ配信の即時1通目・ポイント特典メッセージ・管理画面からの一斉配信・cronワーカーなど大半の送信経路を止められていない。**このフェーズでこの問題を構造的に解決する。**
- 送信元の呼び出し箇所は26箇所、機能単位で8系統ある（監査レポートの1-B節の表を参照）。

## ゴール

`src/lib/line.ts` の7つの送信関数の入口に、**唯一の共通ゲート**を実装する。このゲートを通らずに実際にLINE APIへ送信される経路をゼロにする。加えて、送信モード・機能別トグルを管理する `/settings` のUIを作る。

## 1. 送信モード（DB設定・環境変数で上書き可）

3値: `off` / `test_only` / `on`

- 保存先: 既存の `app_settings` テーブル（`key TEXT`, `value JSONB`, `account_id UUID`（migration 007適用済みならユニークキーは `account_id,key`））。key は `send_mode` とする。value 例: `{"mode": "off"}`。
- **未設定時（行が無い）のデフォルトは `off`**。
- 環境変数 `LINE_SEND_MODE`（値は `off`|`test_only`|`on`）が設定されていれば、**DBの値より優先**する（緊急停止用）。不正な値なら無視してDB値にフォールバック。
- アカウント別（`account_id`）に持たせる必要はない。今回はグローバル1本（`account_id IS NULL` の行、または account_id カラムが無い前提でも動く書き方）でよい。将来アカウント別にしたくなった場合に備えて、読み取りは「`account_id` 指定なしの行」を見る素直な実装にする（既存の `getPointRules` の書き方を参考にしてよい）。

### モードの意味

- `off`: 全ての送信をスキップする。実際にLINE APIを呼ばない。
- `test_only`: 送信先が**「テスト配信」タグを持つ友だち1人への push**（`pushMessage`/`pushMessages`/`sendSurveyMessage`）の場合のみ送信する。それ以外（タグが無い、複数人向け、友だちが見つからない等）は全てスキップ。**`multicastMessage`/`multicastMessages`/`broadcastMessage`/`broadcastMessages` は test_only では宛先に関わらず常にスキップする**（判定不要、無条件スキップでよい）。
- `on`: 下記2節の機能別トグルに従って送信する（トグルがOFFの機能はスキップ）。

「テスト配信」タグの判定は `line_user_id`（push系関数が受け取る引数）から `friends` テーブルを引いて `tags` 配列に `"テスト配信"` が含まれるかで行う。既存コード（`src/app/api/surveys/[id]/send/route.ts:78` や `src/app/(dashboard)/broadcast/page.tsx:308`）が同じタグ名 `"テスト配信"` を使っているので、これを正としてハードコードしてよい（設定化は不要）。

## 2. 機能別トグル（`on` モードの時だけ判定に使う。test_only / off の判定には一切関与しない）

11種、それぞれ boolean。保存先も `app_settings`。key は `send_feature_toggles`、value は `{"keyword_reply": false, "greeting_survey": false, ...}` のようなJSONオブジェクト1本にまとめてよい（11行に分けなくてよい）。**未設定時のデフォルトは全機能 false（=送信しない）**。

トグル名（このまま `SendFeature` という型名でコードに使う）:

```
keyword_reply       // キーワード自動応答の本文送信
greeting_survey     // 友だち追加時のウェルカム挨拶＋アンケート1問目
survey_followup     // アンケートの次質問・完了・診断結果・「回答済みです」等の案内
points              // ポイント残高応答＋ポイント特典到達メッセージ＋特典タグ由来のステップ即時送信
omikuji             // おみくじ応答
login               // サイトログインコード確認応答
step_flow           // ステップ配信cronワーカー（2通目以降の巡回送信）
tag_triggered       // 管理画面でタグを手動追加した時に即時発火するステップ配信1通目
link_triggered      // 計測リンク(/l/[code])のクリックで即時発火するステップ配信1通目
scheduled_broadcast // 管理画面からの一斉配信/セグメント配信/アンケート配信(即時・予約cron含む)
manual_chat         // カルテからの1:1手動送信
```

`on` モードの判定: 呼び出し側が渡した `feature` に対応するトグルが `true` の場合のみ送信。false またはトグル設定自体が無ければスキップ。

## 3. ゲートの実装場所と方式

`src/lib/line.ts` の7つの送信関数（`broadcastMessage`, `broadcastMessages`, `pushMessage`, `pushMessages`, `multicastMessage`, `multicastMessages`, `sendSurveyMessage`）**すべて**に、**必須（オプショナルではない）引数として `feature: SendFeature` を追加**する。関数シグネチャ例:

```ts
export async function pushMessage(
  userId: string,
  text: string,
  feature: SendFeature,
  token?: string
): Promise<unknown>
```

（引数の並び順はこの通り: 既存の必須引数 → `feature` → 既存の任意引数 `token`。既存の呼び出し元は全てコンパイルエラーになるので、このフェーズでは line.ts 側の変更に加えて、**全呼び出し元を洗い出してfeatureを渡すよう修正すること**。これにより「監査の26箇所を全て網羅したか」を `tsc`/`next build` のコンパイルエラーで機械的に検証できるようにするのが狙い。1箇所でも直し漏れがあればビルドが失敗するはずなので、ビルドが通った時点で全呼び出し元の洗い出し漏れがないことの根拠になる。）

各関数の先頭で共通ゲート関数を呼ぶ:

```ts
// 戻り値: 送信してよければ { allow: true }、ダメなら { allow: false, reason: string }
async function gateSend(
  feature: SendFeature,
  recipients: { kind: "single"; lineUserId: string } | { kind: "multi" }
): Promise<{ allow: boolean; reason?: string }>
```

- `off` → `{allow:false, reason:"send_mode_off"}`
- `test_only` かつ `recipients.kind === "multi"` → `{allow:false, reason:"send_mode_test_only_multi_blocked"}`
- `test_only` かつ `recipients.kind === "single"` → line_user_id で friends を引き、tags に「テスト配信」が無ければ `{allow:false, reason:"send_mode_test_only_not_test_friend"}`、あれば `{allow:true}`
- `on` → トグルOFFなら `{allow:false, reason:"feature_disabled:" + feature}`、ONなら `{allow:true}`

`allow:false` の場合、実際の `client.pushMessage` 等は**呼ばない**。かわりに `messages` テーブルには書き込まない（送信ログ自体を汚さない）が、判別できるよう **コンソールログに `[SEND_GATE] skipped feature=... reason=... recipient=...` を出す**ことに加え、**新しい軽量な記録先**として `send_gate_log` というテーブルへ1行 insert する（詳細は4節）。呼び出し元（webhook/step-enrollment/points等）の既存の `logMessage(...)` 呼び出し（`messages` テーブルへの out ログ）は、送信をスキップした場合は**呼ばれないようにする**必要がある（今まで通り、送っていないものを `messages` に out として残さない）。つまり、ゲートで弾かれたかどうかを呼び出し元が判定できるよう、`pushMessage` 等は **送信しなかった場合は `null` を返す**（awaitしている既存コードは戻り値を使っていないので影響なし。ただし `.then()` チェーンで送信成功を前提にログを書いている箇所（例: `src/app/api/webhook/route.ts` の `pushTask`）は、戻り値が `null` でも `.then()` は呼ばれてしまうので、**戻り値を見て `null` ならログをスキップする**ように呼び出し元を直すこと）。

## 4. `send_gate_log` テーブル（新規マイグレーション）

`migrations/009_send_gate.sql` を新規作成する。内容:

```sql
-- 送信ゲートのスキップ記録（「何が送られようとしたか」を後から追えるようにする）
CREATE TABLE IF NOT EXISTS send_gate_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL,
  reason TEXT NOT NULL,
  send_mode TEXT NOT NULL,
  recipient_line_user_id TEXT,
  recipient_count INT,
  friend_id UUID REFERENCES friends(id) ON DELETE SET NULL,
  preview TEXT, -- 送るはずだった本文の先頭100文字程度（あれば）
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_send_gate_log_created ON send_gate_log(created_at DESC);

ALTER TABLE send_gate_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'send_gate_log' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON send_gate_log FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- send_mode / 機能トグルの初期値（未設定なら off・全機能false というアプリ側デフォルトと矛盾しないよう、
-- ここでは行を作らない。アプリ側は「行が無ければoff/全false」を必ず実装すること）
```

`send_gate_log` への insert は失敗しても本処理を止めない（`logMessage`/`logEvent` と同じ握りつぶし方針）。`friend_id` が分かる場合（呼び出し元がfriendIdを知っている場合）は渡せるようにしてよいが、必須にしない（`gateSend` は `line_user_id` だけ受け取る設計なので、`friend_id` の解決は line_user_id からのlookupで得られたものを使ってよい）。

このマイグレーションは **Supabase SQL Editorで手動実行が必要**（このリポジトリの既存運用と同じ。自動実行の仕組みは無い）。README等に「実行してください」という手順を残すこと（後述）。

## 5. 呼び出し元の洗い出しと feature の割り当て（漏れなく全て直すこと）

以下は監査レポートの1-B節に基づく呼び出し元一覧と、割り当てるべき `feature`。**この対応表の通りに直す**こと（勝手に別の割り当てをしない。判断に迷ったらこの表を優先する）:

| ファイル:関数/行（目安） | 呼んでいる line.ts 関数 | feature |
|---|---|---|
| `webhook/route.ts` follow → `sendActiveSurveyFirstQuestion`（友だち追加の初回のみ） | pushMessages | `greeting_survey` |
| `webhook/route.ts` postback（アンケート回答の次質問/完了/診断結果、`pushTask`） | pushMessages | `survey_followup` |
| `webhook/route.ts` message: ログインコード確認 | pushMessage | `login` |
| `webhook/route.ts` message: 自由記入受領ack | pushMessage | `survey_followup` |
| `webhook/route.ts` message: 自由記入後の次質問/完了 | pushMessages | `survey_followup` |
| `webhook/route.ts` message: おみくじ応答 | pushMessage | `omikuji` |
| `webhook/route.ts` message: 「アンケート/再診断」呼び出しの初回質問送信（`sendActiveSurveyFirstQuestion` 経由）、および「送れるアンケートがありません」案内 | pushMessages / pushMessage | `survey_followup` |
| `webhook/route.ts` message: 「アンケート回答済みです」案内 | pushMessage | `survey_followup` |
| `webhook/route.ts` message: ポイント残高応答 | pushMessage | `points` |
| `webhook/route.ts` message: キーワード自動応答の本文送信 | pushMessage | `keyword_reply` |
| `src/lib/step-enrollment.ts` `enrollMatchingStepFlows` の即時1通目送信（`processDueEnrollmentById` 呼び出し） | pushMessage/pushMessages（`processDueEnrollmentById` 内） | **呼び出し元によって変わる。下記参照** |
| `src/lib/step-enrollment.ts` `processDueEnrollmentById`（`/api/step-flows/process` のcronから直接呼ばれる、2通目以降の巡回処理） | pushMessage/pushMessages | `step_flow` |
| `src/lib/points.ts` `awardPoints` の特典到達メッセージ | pushMessages | `points` |
| `src/lib/points.ts` `awardPoints` 内、特典タグ由来の `enrollMatchingStepFlows` 呼び出し（即時1通目） | （enrollMatchingStepFlows経由） | `points` |
| `src/app/api/friends/[id]/tags/route.ts` POST（タグ追加）由来の `enrollMatchingStepFlows`（即時1通目） | （enrollMatchingStepFlows経由） | `tag_triggered` |
| `src/app/l/[code]/route.ts`（リンククリック）由来の `enrollMatchingStepFlows`（即時1通目） | （enrollMatchingStepFlows経由） | `link_triggered` |
| `src/app/api/broadcast/route.ts` POST（全員/セグメント/アンケート回答ベース、即時送信。予約ではなくその場配信） | broadcastMessage/broadcastMessages/multicastMessage/multicastMessages/（個別化時は`personalize.ts`経由でpushMessages） | `scheduled_broadcast` |
| `src/app/api/broadcast/process/route.ts`（cronによる予約配信の実行） | 上記と同じ関数群 | `scheduled_broadcast` |
| `src/app/api/surveys/[id]/send/route.ts`（mode='test'/'all' 問わず） | sendSurveyMessage | `scheduled_broadcast` |
| `src/app/api/friends/[id]/message/route.ts`（カルテ1:1手動送信） | pushMessage | `manual_chat` |

### `enrollMatchingStepFlows` の feature 伝播（重要・設計指示）

`enrollMatchingStepFlows(supabase, friendId, friendTags, accountId)` は6箇所から呼ばれており、呼び出し元によって「なぜこの友だちが今タグにマッチしてフローに入ったか」が異なる。この関数はマッチしたフローの**即時1通目**を `processDueEnrollmentById` 経由で送るため、**呼び出し元が意図（feature）を伝播できるようにシグネチャを拡張する**:

```ts
export async function enrollMatchingStepFlows(
  supabase: SupabaseClient,
  friendId: string,
  friendTags: string[],
  accountId: string | undefined,
  originFeature: SendFeature   // 新規必須引数（即時1通目の送信に使うfeature）
): Promise<void>
```

呼び出し元ごとに渡す `originFeature`:
- `webhook/route.ts` follow（`FOLLOW_TAG` 付与直後） → `greeting_survey`
- `webhook/route.ts` postback（回答保存後のタグ付与） → `survey_followup`
- `webhook/route.ts` 自由記入（2箇所） → `survey_followup`
- `webhook/route.ts` キーワード応答の `add_tags` → `keyword_reply`
- `src/app/api/friends/[id]/tags/route.ts` → `tag_triggered`
- `src/app/l/[code]/route.ts` → `link_triggered`
- `src/lib/points.ts` の特典タグ由来 → `points`

`processDueEnrollmentById` 自体も `feature: SendFeature` を必須引数として受け取り、内部の pushMessage/pushMessages 呼び出しにそのまま渡す形にする。`enrollMatchingStepFlows` が即時送信のために呼ぶ時は `originFeature` を渡し、`/api/step-flows/process`（cronワーカー）が巡回処理のために直接呼ぶ時は `"step_flow"` を渡す。

## 6. `AUTO_RESPONSES_DISABLED` の削除

`src/app/api/webhook/route.ts` の以下を削除し、新ゲートに一本化する:
- `AUTO_RESPONSES_DISABLED` 定数（15行目）とそのコメント（11-14行目）
- ローカルの `pushMessage`/`pushMessages` ラッパー（17-35行目）
- `logMessage` のローカルオーバーライド（38-41行目）

削除後、ファイル内で直接 `@/lib/line` の `pushMessage`/`pushMessages` を呼び、それぞれに正しい `feature` を渡す（5節の対応表通り）。`logMessage` は `@/lib/logging` のものをそのまま使い、送信をスキップした場合（戻り値が `null`）は out ログを書かないよう呼び出し元で分岐する（3節参照）。

`off` は新ゲートの上位互換であることを踏まえ、**`off` モードなら旧 `AUTO_RESPONSES_DISABLED=true` と同じかそれ以上に安全**であることを確認すること（webhookの10機能に加え、ステップ配信・ポイント特典・一斉配信・cronも全部止まる＝旧スイッチより広い範囲を止める。これが正しい仕様）。

## 7. `/settings` に「送信制御」パネルを追加

`src/app/(dashboard)/settings/page.tsx` に新しいカードを追加する（既存の「LINEアカウント管理」カードの前後どちらでもよいが、目立つよう先頭に置くことを推奨）。

- 送信モードのラジオボタン3択（off / test_only / on の日本語ラベル。例: 「停止中（何も送らない）」「テストのみ（テスト配信タグの友だちにのみ送る）」「本番（設定した機能のみ送る）」）
- **モードを変更する操作には、確定前に `window.confirm` で「本当に本番送信を有効にしますか？」（`on` を選んだ時）、または「送信を停止しますか？」（`off` を選んだ時。test_onlyへの変更は確認不要でよい）を挟む**。confirmでキャンセルしたら元の選択に戻す。
- 環境変数 `LINE_SEND_MODE` が設定されている場合、DBの値より優先されることをAPIのレスポンスに含め、UI上に「環境変数 `LINE_SEND_MODE=xxx` が優先されています（DBの設定は無視されます）」という注記を出す（変更フォーム自体は出してよいが、効かないことが分かるようにする）。
- 機能別トグル11個のON/OFFスイッチ一覧（各トグルの日本語名を添える。例: `keyword_reply` → 「キーワード自動応答」）。デフォルト全部OFF。
- 直近24時間の「送信数」「スキップ数」を表示する小さな統計（`messages` テーブルの `direction='out'` かつ `created_at > now() - interval '24 hours'` の件数、`send_gate_log` の同期間の件数）。表示専用でよい（グラフ不要、数字だけで可）。

APIは新規に `src/app/api/settings/send-gate/route.ts` を作り、GET（現在のモード・トグル・環境変数優先の有無・直近24時間統計を返す）とPUT（モード・トグルの更新。DBへupsert）を実装する。既存の `src/app/api/points/settings/route.ts` の書き方（`app_settings` へのupsert）を参考にしてよい。このAPIは管理画面配下なので `src/proxy.ts` の認証（cookieセッション）で自動的に保護される（`PUBLIC_PREFIXES` に追加しないこと）。

## 8. 安全ルール（最重要・逸脱禁止）

- **実装中・テスト中に実際のLINE Messaging APIを1回も呼び出さないこと。** `npm run build` はビルドのみで実行されず問題ないはずだが、もし何らかのテストスクリプトやシードスクリプトが実際に `getLineClient()` を経由して外部にHTTPを投げる可能性がある場合は、そのようなコードを追加しないこと。
- 追加するユニットテスト（vitest等、フェーズ1で `devDependencies` に追加してよい）は、`@line/bot-sdk` の `messagingApi.MessagingApiClient` をモック（`vi.mock`）し、実際のネットワーク呼び出しが発生しないことを確認できる形にする。最低限、以下をテストすること:
  - `off` モード: push/multicast/broadcast のいずれも、モックされた `client.pushMessage`/`client.multicast`/`client.broadcast` が **呼ばれない**こと
  - `test_only` モード: 「テスト配信」タグを持つ friend への push は呼ばれる、持たない friend への push は呼ばれない、multicast/broadcastはタグに関わらず呼ばれないこと
  - `on` モード: 該当featureのトグルがtrueの時だけ呼ばれ、falseの時は呼ばれないこと
  - 環境変数 `LINE_SEND_MODE` がDBより優先されること
- `npm run build` が通ること（型エラーゼロ）。既存の `npm run lint` があれば併せて通すこと。

## 9. このフェーズでは対象外（フェーズ2で別途実施）

- キーワード完全一致マッチの追加・既存2件のマッチタイプ変更
- `cascade: false` の追加
- cronエンドポイントの `CRON_SECRET` 認証

このフェーズではこれらに手を出さないこと（後続のSPEC_SEND_GATE_PHASE2.mdで実施する）。

## 完了条件（フェーズ1）

1. `src/lib/line.ts` の7関数全てが `feature: SendFeature` を必須引数として受け取り、`gateSend` を通らない限り実際のLINE API呼び出しを行わない
2. 監査レポートの26呼び出し箇所が全て対応表通りの feature を渡すよう修正されている（`npm run build` が通ることで機械的に裏付けられる状態にする）
3. `app_settings` の `send_mode` / `send_feature_toggles` が未設定でも安全側（off・全機能false）で動く
4. `migrations/009_send_gate.sql` が作成されている
5. `/settings` に送信制御パネルが追加され、モード変更に確認ダイアログがある
6. `AUTO_RESPONSES_DISABLED` とその関連コードが削除されている
7. ユニットテストが追加され、実際のLINE API呼び出しなしで off/test_only/on の3モードの挙動を検証できる
8. `npm run build` が型エラーなく通る

作業が終わったら、変更したファイル一覧と、5節の対応表のうちどこか対応関係を変えた箇所があればその理由を報告すること。
