# 送信ゲート（デフォルトoff）デプロイ前チェック — 2026-09-06

## 目的
送信ゲートをデフォルトoffでデプロイすると、cronが稼働中のステップ配信・予約配信を
「送らずに消化（completed/sent扱い）」して復旧不能になる懸念があったため、
デプロイ前に現状をSupabase上で確認した記録。

- Supabase project: ftiaotgzhyqsjmlojucz (line-harness/.env.local の NEXT_PUBLIC_SUPABASE_URL)
- 確認方法: service role keyで読み取り専用クエリを実行（スクリプトは確認後に削除、キー値は本ファイルに未記載）
- スキーマ根拠: `supabase-schema.sql`（step_flows / step_enrollments / broadcasts のCREATE TABLE定義）
- コード根拠: `src/lib/step-enrollment.ts:162`
  `if (enrollment.step_flows?.status !== "active") return { sent: false, completed: false };`
  → status が active 以外（paused/draft含む）なら送信せず、completed/cancelled等の状態変更もせず
  そのままreturnする（＝消化されない。cronが巡回しても何も起きない）ことをコードで確認済み。

## 確認結果（2026-09-06時点）

### step_flows（ステップ配信フロー）
| status | 件数 |
|---|---|
| active | **0件** |
| paused | 26件 |
| draft | 1件 |

→ **稼働中（status='active'）のフローは現時点で0件。** 全26フローは既にpaused、1件はdraft。
今回のデプロイ作業のために新たにpausedへ変更したフローは無し（元々0件だったため更新操作は未実施）。

paused中の26フロー内訳（account_id: 0c972a74-b3c2-40da-85e2-324637e424af 全て）:
- L1_新規集客×{HPB診断改善ミニ講座, Instagram, Threads, 紹介口コミ, 全般}
- L1_単価UP×{HPB, Instagram, Threads, 紹介口コミ, 全般}
- L1_リピート×{HPB, Instagram, Threads, 紹介口コミ, 全般}
- L1_SNS発信×{HPB, Instagram, Threads, 紹介口コミ, 全般}
- L1_仕組み化×{HPB, Instagram, Threads, 紹介口コミ, 全般}
- 勉強会後フォローアップ（trigger_tag: 勉強会参加）

draft 1件: 新規登録ウェルカム（Threads導線） (id: 18d6d0ff-055c-4a0d-9216-313381099081)

### step_enrollments（友だちごとの進行状況）
| status | 件数 |
|---|---|
| active（進行中） | **0件** |
| completed | 44件 |
| cancelled | 4件 |

→ 進行中（未completed）の登録は0件。仮にcronが動いても消化される対象が存在しない。

### broadcasts（予約配信含む配信履歴）
| status | 件数 |
|---|---|
| scheduled / pending | **0件** |
| sent | 20件 |
| draft | 4件 |

→ pending/scheduledの予約配信は0件。DB変更は行っていない（対象が無いため）。

## 結論・実施内容
- 対象（active step_flows / 進行中enrollments / pending broadcasts）は**いずれも0件**だった。
- そのため「status='paused'への更新」「予約配信の記録」いずれも**実施対象なし**。DB書き込みは一切行っていない。
- 送信ゲートoffデプロイ時に「稼働中フローが送らずに消化される」「予約配信が送られずsent扱いになる」
  というリスクシナリオは、**現時点のデータでは発生し得ない**（active/scheduled対象が存在しないため）。
- ただし今後、誰かがフローをactiveに戻す／新規予約配信を作成する可能性はあるため、
  デプロイ後も定期的に同じ確認（本ファイルの手順）を行うことを推奨する。

## 禁止事項の遵守
- メッセージ送信・削除は一切行っていない。
- DB変更は行っていない（対象0件のため）。
- Supabaseキー値は本ファイルに記載していない。
- manager.line.bizには一切アクセスしていない。
