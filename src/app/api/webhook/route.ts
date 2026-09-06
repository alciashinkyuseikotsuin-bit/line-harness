import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getUserProfile,
  pushMessage,
  pushMessages,
  buildSurveyFlexMessage,
} from "@/lib/line";

import { enrollMatchingStepFlows } from "@/lib/step-enrollment";
import { logMessage, logEvent } from "@/lib/logging";
import { awardPoints, getPointRules } from "@/lib/points";
import { recalcFriendScore } from "@/lib/engagement";
import {
  findAutoReply,
  drawOmikuji,
  detectBuiltinCommand,
} from "@/lib/engage";
import { computeDiagnosisResult } from "@/lib/diagnosis";
import {
  getAccounts,
  resolveSecret,
  resolveToken,
  type LineAccount,
} from "@/lib/accounts";
import type { SupabaseClient } from "@supabase/supabase-js";

// LINE署名検証
function verifySignature(
  body: string,
  signature: string,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

/**
 * どのLINEアカウント宛のWebhookかを特定する。
 * 1. destination（Bot自身のuserId）が既知ならそのアカウントの秘密鍵で署名検証
 * 2. 未知なら全アカウントの秘密鍵で検証を試し、一致したアカウントに destination を学習させる
 * 3. line_accounts が空（migration未実行）なら環境変数で検証（従来動作）
 */
async function resolveWebhookAccount(
  supabase: SupabaseClient,
  body: string,
  signature: string,
  destination: string | undefined
): Promise<{ account: LineAccount | null; ok: boolean }> {
  const accounts = await getAccounts(supabase);

  if (accounts.length === 0) {
    // 従来動作（シングルアカウント・環境変数）
    return {
      account: null,
      ok: verifySignature(body, signature, process.env.LINE_CHANNEL_SECRET),
    };
  }

  // destination で特定できる場合
  if (destination) {
    const known = accounts.find((a) => a.destination_user_id === destination);
    if (known) {
      return {
        account: known,
        ok: verifySignature(body, signature, resolveSecret(known)),
      };
    }
  }

  // 全アカウントの秘密鍵で試す（初回受信時）
  for (const account of accounts) {
    if (verifySignature(body, signature, resolveSecret(account))) {
      if (destination && account.destination_user_id !== destination) {
        // destination を学習して次回から高速化
        await supabase
          .from("line_accounts")
          .update({ destination_user_id: destination })
          .eq("id", account.id);
      }
      return { account, ok: true };
    }
  }

  return { account: null, ok: false };
}

type FriendRow = {
  id: string;
  line_user_id: string;
  tags: string[] | null;
  pending_input: Record<string, unknown> | null;
  display_name: string | null;
  points: number | null;
};

// 友だちを取得。未登録ならプロフィールを取得して登録する（アカウント内で）
async function findOrCreateFriend(
  supabase: SupabaseClient,
  lineUserId: string,
  account: LineAccount | null
): Promise<FriendRow | null> {
  let query = supabase
    .from("friends")
    .select("id, line_user_id, tags, pending_input, display_name, points")
    .eq("line_user_id", lineUserId);
  if (account) query = query.eq("account_id", account.id);
  const { data: existing } = await query.limit(1).maybeSingle();
  if (existing) return existing as FriendRow;

  try {
    const profile = await getUserProfile(lineUserId, resolveToken(account));
    const row: Record<string, unknown> = {
      line_user_id: lineUserId,
      display_name: profile.displayName,
      picture_url: profile.pictureUrl,
      status_message: profile.statusMessage,
      is_blocked: false,
      joined_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
    };
    if (account) row.account_id = account.id;

    const { data: created } = await supabase
      .from("friends")
      .upsert(row, {
        onConflict: account ? "account_id,line_user_id" : "line_user_id",
      })
      .select("id, line_user_id, tags, pending_input, display_name, points")
      .single();
    return created as FriendRow | null;
  } catch (err) {
    console.error("友だち登録失敗:", err);
    return null;
  }
}

// 有効なアンケート（最新のstatus=active）の1問目を、挨拶文つきで送信する。
// 友だち追加時のウェルカムアンケートと、既存の友だちが「アンケート」キーワードで
// 呼び出す場合の両方から使う共通処理。
async function sendActiveSurveyFirstQuestion(
  supabase: SupabaseClient,
  friendId: string,
  lineUserId: string,
  token: string | undefined,
  accountId: string | undefined,
  greetingText: string,
  feature: "greeting_survey" | "survey_followup"
): Promise<boolean> {
  try {
    // step_only（ステップ配信専用）のアンケートは、友だち追加直後や
    // キーワード呼び出しでは送らない（新規登録者の2日目ステップでのみ送る）
    let surveyQuery = supabase
      .from("surveys")
      .select(
        `id, survey_questions (
          id, question_text, sort_order,
          survey_choices ( id, choice_text, sort_order )
        )`
      )
      .eq("status", "active")
      .eq("step_only", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (accountId) {
      surveyQuery = surveyQuery.eq("account_id", accountId);
    }
    const { data: survey } = await surveyQuery.maybeSingle();
    if (!survey) return false;

    const sortedQuestions = (survey.survey_questions || []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    );
    const firstQ = sortedQuestions[0];
    if (!firstQ) return false;

    const choices = (firstQ.survey_choices || [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((c: { id: string; choice_text: string }) => ({ id: c.id, text: c.choice_text }));

    const sent = await pushMessages(
      lineUserId,
      [
        { type: "text", text: greetingText },
        buildSurveyFlexMessage(survey.id, firstQ.id, firstQ.question_text, choices),
      ],
      feature,
      token
    );
    if (sent !== null) await logMessage(supabase, friendId, {
      direction: "out",
      content: `${greetingText}\n\nアンケート: ${firstQ.question_text}`,
      source: "survey",
      metadata: { survey_id: survey.id },
    });
    return true;
  } catch (err) {
    console.error("アンケート送信エラー:", err);
    return false;
  }
}

// アンケートの次質問 or 完了処理（診断結果・完了メッセージ）を組み立てる
async function buildNextStepOrCompletion(
  supabase: SupabaseClient,
  surveyId: string,
  questionId: string,
  friendId: string
): Promise<{ messages: unknown[]; addTag: string | null; completed: boolean }> {
  const [allQuestionsRes, answeredRes, surveyRes] = await Promise.all([
    supabase
      .from("survey_questions")
      .select(
        `id, question_text, sort_order,
         survey_choices ( id, choice_text, sort_order )`
      )
      .eq("survey_id", surveyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("survey_responses")
      .select("question_id")
      .eq("survey_id", surveyId)
      .eq("friend_id", friendId),
    supabase
      .from("surveys")
      .select("completion_message, survey_type")
      .eq("id", surveyId)
      .single(),
  ]);

  const allQuestions = (allQuestionsRes.data || []) as unknown as {
    id: string;
    question_text: string;
    sort_order: number;
    survey_choices: { id: string; choice_text: string; sort_order: number }[];
  }[];
  const currentQ = allQuestions.find((q) => q.id === questionId);
  const answeredIds = new Set(
    (answeredRes.data || []).map((a: { question_id: string }) => a.question_id)
  );
  answeredIds.add(questionId);

  const nextQ = currentQ
    ? allQuestions
        .filter((q) => q.sort_order > currentQ.sort_order)
        .find((q) => !answeredIds.has(q.id))
    : undefined;

  const messages: unknown[] = [];
  let addTag: string | null = null;
  let completed = false;

  if (nextQ) {
    const sortedChoices = (nextQ.survey_choices || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, text: c.choice_text }));
    messages.push(
      buildSurveyFlexMessage(surveyId, nextQ.id, nextQ.question_text, sortedChoices)
    );
  } else {
    // 完了済みかどうかを確認（トーク履歴に残った古いボタンの再タップによる
    // 完了メッセージ・ポイントの重複付与を防止する）
    const { data: existingCompletion } = await supabase
      .from("friend_events")
      .select("id")
      .eq("friend_id", friendId)
      .eq("event_type", "survey_fully_completed")
      .contains("metadata", { survey_id: surveyId })
      .limit(1)
      .maybeSingle();

    if (existingCompletion) {
      messages.push({
        type: "text",
        text: "このアンケートは受付済みです。プレゼントは既にお届けしています🙏",
      });
    } else {
      completed = true;
      const completionMessage = surveyRes.data?.completion_message;
      if (completionMessage && completionMessage.trim()) {
        messages.push({ type: "text", text: completionMessage });
      }

      // 診断タイプなら結果を計算して送る
      if (surveyRes.data?.survey_type === "diagnosis") {
        try {
          const outcome = await computeDiagnosisResult(supabase, surveyId, friendId);
          if (outcome) {
            messages.push({
              type: "text",
              text: `🎯 診断結果：${outcome.title}\n\n${outcome.resultMessage}`,
            });
            addTag = outcome.addTag;
            await logEvent(supabase, friendId, "diagnosis_complete", {
              survey_id: surveyId,
              type_key: outcome.typeKey,
              scores: outcome.scores,
            });
          }
        } catch (diagErr) {
          console.error("診断結果計算エラー:", diagErr);
        }
      }

      await logEvent(supabase, friendId, "survey_fully_completed", {
        survey_id: surveyId,
      });
    }
  }

  return { messages, addTag, completed };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  const parsed = JSON.parse(body) as {
    destination?: string;
    events: import("@line/bot-sdk").WebhookEvent[];
  };
  const supabase = getSupabaseAdmin();

  // アカウント特定＋署名検証
  const { account, ok } = await resolveWebhookAccount(
    supabase,
    body,
    signature,
    parsed.destination
  );
  if (!ok) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const accountId = account?.id;
  const token = resolveToken(account);
  const events = parsed.events || [];

  for (const event of events) {
    try {
      switch (event.type) {
        case "follow": {
          if (!event.source.userId) break;
          // 友だち追加
          const profile = await getUserProfile(event.source.userId, token);
          const row: Record<string, unknown> = {
            line_user_id: event.source.userId,
            display_name: profile.displayName,
            picture_url: profile.pictureUrl,
            status_message: profile.statusMessage,
            is_blocked: false,
            joined_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          };
          if (accountId) row.account_id = accountId;
          const { data: followed } = await supabase
            .from("friends")
            .upsert(row, {
              onConflict: accountId
                ? "account_id,line_user_id"
                : "line_user_id",
            })
            .select("id, tags")
            .single();
          if (followed) {
            await logEvent(supabase, followed.id, "follow", {});

            // 「友だち追加」タグを付与し、このタグをトリガーにする
            // ウェルカムステップフロー（0日目特典→1日目教育→2日目アンケート）へ登録する。
            // 既に登録済みのフローには enrollMatchingStepFlows 側で再登録されないため、
            // ブロック解除→再追加でウェルカム配信が二重に走ることはない。
            const FOLLOW_TAG = "友だち追加";
            const followTags: string[] =
              (followed.tags as string[] | null) || [];
            const tagsWithFollow = followTags.includes(FOLLOW_TAG)
              ? followTags
              : [...followTags, FOLLOW_TAG];
            if (tagsWithFollow !== followTags) {
              await supabase
                .from("friends")
                .update({ tags: tagsWithFollow })
                .eq("id", followed.id);
            }
            await enrollMatchingStepFlows(
              supabase,
              followed.id,
              tagsWithFollow,
              accountId,
              "greeting_survey"
            );

            // ウェルカムアンケートを自動送信（最新のstatus=active、step_only除く）
            await sendActiveSurveyFirstQuestion(
              supabase,
              followed.id,
              event.source.userId,
              token,
              accountId,
              "友達追加ありがとうございます！\n\nあなたに最適な情報をお届けするために、1分でできるアンケートにご協力ください📝",
              "greeting_survey"
            );
          }
          break;
        }

        case "unfollow": {
          // ブロック
          let unfollowQuery = supabase
            .from("friends")
            .update({ is_blocked: true })
            .eq("line_user_id", event.source.userId);
          if (accountId) unfollowQuery = unfollowQuery.eq("account_id", accountId);
          const { data: unfollowed } = await unfollowQuery.select("id").limit(1);
          if (unfollowed && unfollowed[0]) {
            await logEvent(supabase, unfollowed[0].id, "unfollow", {});
          }
          break;
        }

        case "postback": {
          // アンケート回答処理
          const pbUserId = event.source.userId;
          const pbData = new URLSearchParams(pbUserId ? event.postback.data : "");
          const surveyId = pbData.get("survey");
          const questionId = pbData.get("question");
          const choiceId = pbData.get("choice");

          if (surveyId && questionId && choiceId && pbUserId) {
            const friend = await findOrCreateFriend(supabase, pbUserId, account);
            if (!friend) break;

            // トーク履歴に残った古いボタンを再タップした場合、回答ポイントを
            // 何度も稼げてしまわないように、上書き（upsert）する前に既存回答の有無を確認する
            const { data: existingAnswer } = await supabase
              .from("survey_responses")
              .select("question_id")
              .eq("friend_id", friend.id)
              .eq("question_id", questionId)
              .maybeSingle();
            const isReAnswer = !!existingAnswer;

            // Phase 1: 互いに依存しない読み書きを並列実行（回答保存・選択肢/友だち取得・ポイントルール取得）
            const [, choiceRes, currentFriendRes, rules] = await Promise.all([
              supabase.from("survey_responses").upsert(
                {
                  survey_id: surveyId,
                  question_id: questionId,
                  choice_id: choiceId,
                  friend_id: friend.id,
                  responded_at: new Date().toISOString(),
                },
                { onConflict: "friend_id,question_id" }
              ),
              supabase
                .from("survey_choices")
                .select("tag, broadcast_message, choice_text")
                .eq("id", choiceId)
                .single(),
              supabase.from("friends").select("tags").eq("id", friend.id).single(),
              getPointRules(supabase, accountId),
            ]);

            const choice = choiceRes.data;
            if (!choice) break;

            // 回答ログ（完了を待たずバックグラウンドで進める）
            const logTasks: Promise<unknown>[] = [
              logEvent(supabase, friend.id, "survey_answer", {
                survey_id: surveyId,
                question_id: questionId,
                choice_id: choiceId,
                choice_text: choice.choice_text,
              }),
              logMessage(supabase, friend.id, {
                direction: "in",
                content: choice.choice_text,
                source: "survey",
                metadata: { survey_id: surveyId, question_id: questionId },
              }),
            ];

            // タグ計算
            const currentTags: string[] = currentFriendRes.data?.tags || [];
            let updatedTags =
              choice.tag && !currentTags.includes(choice.tag)
                ? [...currentTags, choice.tag]
                : currentTags;

            const isFreeInputChoice =
              !!choice.broadcast_message &&
              !!choice.tag &&
              choice.tag.includes("その他");

            // 次質問 or 完了（診断結果含む）を組み立て
            let nextStep: {
              messages: unknown[];
              addTag: string | null;
              completed: boolean;
            } = { messages: [], addTag: null, completed: false };
            if (!isFreeInputChoice) {
              nextStep = await buildNextStepOrCompletion(
                supabase,
                surveyId,
                questionId,
                friend.id
              );
              if (nextStep.addTag && !updatedTags.includes(nextStep.addTag)) {
                updatedTags = [...updatedTags, nextStep.addTag];
              }
            }

            // 友だちレコード更新（内容を組み立てるのみ。書き込みはPhase 2で並列実行）
            const friendUpdate: Record<string, unknown> = {
              last_active_at: new Date().toISOString(),
            };
            if (updatedTags !== currentTags) {
              friendUpdate.tags = updatedTags;
            }
            if (isFreeInputChoice) {
              friendUpdate.pending_input = {
                type: "free_tag",
                base_tag: (choice.tag as string).replace(":その他", ""),
                prompt: choice.broadcast_message,
                survey_id: surveyId,
                question_id: questionId,
              };
            }

            // === 送信メッセージを組み立て ===
            const messagesToSend: unknown[] = [];
            if (choice.broadcast_message) {
              messagesToSend.push({ type: "text", text: choice.broadcast_message });
            }
            messagesToSend.push(...nextStep.messages);

            const pushTask =
              messagesToSend.length > 0
                ? pushMessages(pbUserId, messagesToSend, "survey_followup", token)
                    .then((sent) => sent === null ? undefined :
                      logMessage(supabase, friend.id, {
                        direction: "out",
                        content: messagesToSend
                          .map((m) => {
                            const msg = m as {
                              type: string;
                              text?: string;
                              altText?: string;
                            };
                            return msg.type === "text"
                              ? msg.text
                              : msg.altText || `[${msg.type}]`;
                          })
                          .join("\n"),
                        source: nextStep.completed ? "diagnosis" : "survey",
                        metadata: { survey_id: surveyId },
                      })
                    )
                    .catch((err) => console.error("push 失敗:", err))
                : Promise.resolve();

            // バックグラウンド処理: ステップフロー登録・ポイント付与
            // enrollMatchingStepFlows は updatedTags を直接受け取るため friends.update の完了を待つ必要がない
            const bgTasks: Promise<unknown>[] = [
              enrollMatchingStepFlows(supabase, friend.id, updatedTags, accountId, "survey_followup"),
            ];
            if (!isReAnswer && rules.survey_answer > 0) {
              bgTasks.push(
                awardPoints(
                  supabase,
                  { id: friend.id, line_user_id: pbUserId },
                  rules.survey_answer,
                  "アンケート回答",
                  { survey_id: surveyId }
                )
              );
            }
            if (nextStep.completed && rules.survey_complete > 0) {
              bgTasks.push(
                awardPoints(
                  supabase,
                  { id: friend.id, line_user_id: pbUserId },
                  rules.survey_complete,
                  "アンケート完了",
                  { survey_id: surveyId }
                )
              );
            }

            // Phase 2: 友だち更新・メッセージ送信・ステップ登録/ポイント付与を並列実行
            await Promise.allSettled([
              ...logTasks,
              supabase.from("friends").update(friendUpdate).eq("id", friend.id),
              pushTask,
              ...bgTasks,
            ]);
            await recalcFriendScore(supabase, friend.id);
          }
          break;
        }

        case "message": {
          const userId = event.source.userId;
          if (!userId) break;

          const friend = await findOrCreateFriend(supabase, userId, account);
          if (!friend) break;

          const isText = event.message?.type === "text" && !!event.message?.text;
          const inboundText = event.message.type === "text" ? event.message.text : "";

          // === 応答速度の要 ===
          // 受信ログ・イベント記録・最終アクティブ更新は返信内容に影響しないため、
          // 返信を先に送り、これらは deferred にためて各分岐の最後でまとめて待つ。
          // （serverless のため、レスポンスを返す前に必ず flush() で完了を待つこと）
          const deferred: Promise<unknown>[] = [
            logMessage(supabase, friend.id, {
              direction: "in",
              messageType: event.message?.type || "unknown",
              content: isText
                ? inboundText
                : `[${event.message?.type || "unknown"}]`,
              source: "webhook",
            }),
            logEvent(supabase, friend.id, "message", {
              message_type: event.message?.type || "unknown",
            }),
          ];
          // deferred の完了保証は下の try/finally が構造的に行う。
          // 分岐ごとに flush を呼ぶ方式は「break の追加し忘れ」「例外時のログ消失」が
          // 起きるため採らない。break でも throw でも finally は必ず実行される。
          try {
          // === 0) サイトのコードログイン（「ログイン 123456」）===
          // 公式サイトが発行した6桁コードを本人がLINEで送る → site_login イベントを記録
          // → サイト側(/api/auth/status)がこれを検知してログイン完了する。
          // パターンが特殊なため他のどの処理よりも先に判定する。
          if (isText) {
            const loginMatch = inboundText
              .trim()
              .match(/^ログイン[ 　]*([0-9]{6})$/);
            if (loginMatch) {
              // サイトのポーリングが見つけられるよう、イベント記録は返信より先に確定させる
              await logEvent(supabase, friend.id, "site_login", {
                code: loginMatch[1],
              });
              const replyText =
                "✅ 本人確認ができました！\nサイトの画面に戻ると、自動でログイン済みに切り替わります。";
              const sent = await pushMessage(userId, replyText, "login", token);
              if (sent !== null) deferred.push(
                logMessage(supabase, friend.id, {
                  direction: "out",
                  content: replyText,
                  source: "system",
                })
              );
              break;
            }
          }

          // === 1) 自由記入待ち（アンケートの「その他」入力）===
          const pendingInput = friend.pending_input as {
            type?: string;
            base_tag?: string;
            survey_id?: string;
            question_id?: string;
          } | null;

          if (pendingInput?.type === "free_tag" && isText) {
            const inputText = inboundText.trim();
            const baseTag = pendingInput.base_tag || "業種";
            const newTag = `${baseTag}:${inputText}`;
            const currentTags: string[] = friend.tags || [];

            // 「その他」タグを削除して、入力されたタグに置き換え
            const updatedTags = currentTags
              .filter((t: string) => !t.includes("その他"))
              .concat(newTag);

            await supabase
              .from("friends")
              .update({ tags: updatedTags, pending_input: null })
              .eq("id", friend.id);

            const ackText = `「${inputText}」で登録しました！ありがとうございます。`;
            const ackSent = await pushMessage(userId, ackText, "survey_followup", token);
            if (ackSent !== null) await logMessage(supabase, friend.id, {
              direction: "out",
              content: ackText,
              source: "survey",
            });
            await enrollMatchingStepFlows(supabase, friend.id, updatedTags, accountId, "survey_followup");

            // 自由記入が含まれていたアンケートの次質問 / 完了メッセージ
            if (pendingInput.survey_id && pendingInput.question_id) {
              try {
                const nextStep = await buildNextStepOrCompletion(
                  supabase,
                  pendingInput.survey_id,
                  pendingInput.question_id,
                  friend.id
                );
                if (nextStep.addTag && !updatedTags.includes(nextStep.addTag)) {
                  const withDiagTag = [...updatedTags, nextStep.addTag];
                  await supabase
                    .from("friends")
                    .update({ tags: withDiagTag })
                    .eq("id", friend.id);
                  await enrollMatchingStepFlows(
                    supabase,
                    friend.id,
                    withDiagTag,
                    accountId,
                    "survey_followup"
                  );
                }
                if (nextStep.messages.length > 0) {
                  await pushMessages(userId, nextStep.messages, "survey_followup", token);
                }
              } catch (nextErr) {
                console.error("自由記入後の次質問/完了送信エラー:", nextErr);
              }
            }
            deferred.push(recalcFriendScore(supabase, friend.id));
            break;
          }

          if (isText) {
            // === 2) 組み込みコマンド（おみくじ・ポイント確認）===
            const builtin = detectBuiltinCommand(inboundText);

            if (builtin === "omikuji") {
              const result = await drawOmikuji(supabase, friend.id, accountId);
              let replyText: string;
              if (result.status === "drawn") {
                replyText = `⛩️ 今日の運勢は…\n\n【${result.fortune}】\n\n${result.message}`;
                deferred.push(
                  logEvent(supabase, friend.id, "omikuji", {
                    fortune: result.fortune,
                    item_id: result.itemId,
                  })
                );
                // おみくじでのポイント付与は廃止（2026-07-13）。設定で明示的に>0の場合のみ付与
                const rules = await getPointRules(supabase, accountId);
                if (rules.omikuji > 0) {
                  await awardPoints(
                    supabase,
                    { id: friend.id, line_user_id: userId },
                    rules.omikuji,
                    "おみくじ",
                    { fortune: result.fortune }
                  );
                }
              } else if (result.status === "already") {
                replyText =
                  "今日のおみくじはもう引きました🙏\nまた明日引いてみてくださいね！";
              } else {
                replyText = "おみくじは準備中です。もう少しお待ちください！";
              }
              const sent = await pushMessage(userId, replyText, "omikuji", token);
              if (sent !== null) deferred.push(
                logMessage(supabase, friend.id, {
                  direction: "out",
                  content: replyText,
                  source: "omikuji",
                })
              );
              deferred.push(recalcFriendScore(supabase, friend.id));
              break;
            }

            if (builtin === "survey" || builtin === "resurvey") {
              // 「アンケート」: 回答済みの人には再送せず、その旨を案内する
              // （サイトの1分問診ボタン等から何度でも呼ばれるため、二重回答を防ぐ）
              if (builtin === "survey") {
                const { data: doneEvent } = await supabase
                  .from("friend_events")
                  .select("id")
                  .eq("friend_id", friend.id)
                  .eq("event_type", "survey_fully_completed")
                  .limit(1)
                  .maybeSingle();
                if (doneEvent) {
                  const replyText =
                    "アンケートにはすでにご回答いただいています🙏\nあなたに合わせたプレゼントもお届け済みです。\n\n状況が変わったのでもう一度回答し直したい場合は、「再診断」と送ってください。";
                  const sent = await pushMessage(userId, replyText, "survey_followup", token);
                  if (sent === null) break;
                  deferred.push(
                    logMessage(supabase, friend.id, {
                      direction: "out",
                      content: replyText,
                      source: "survey",
                    }),
                    recalcFriendScore(supabase, friend.id)
                  );
                  break;
                }
              }

              // 「再診断」: 過去の回答と完了マーカーをリセットしてから最初の質問を送る
              // （リセットしないと最終問で「受付済み」ガードに当たり完了メッセージが出ない）
              if (builtin === "resurvey") {
                await supabase
                  .from("survey_responses")
                  .delete()
                  .eq("friend_id", friend.id);
                await supabase
                  .from("friend_events")
                  .delete()
                  .eq("friend_id", friend.id)
                  .eq("event_type", "survey_fully_completed");
              }

              const sent = await sendActiveSurveyFirstQuestion(
                supabase,
                friend.id,
                userId,
                token,
                accountId,
                builtin === "resurvey"
                  ? "再診断ですね！最新の状況で答えてください📝"
                  : "ご協力ありがとうございます！早速いきましょう📝",
                "survey_followup"
              );
              if (!sent) {
                const replyText = "現在お送りできるアンケートがありません。もう少しお待ちください🙏";
                const sent = await pushMessage(userId, replyText, "survey_followup", token);
                if (sent === null) break;
                deferred.push(
                  logMessage(supabase, friend.id, {
                    direction: "out",
                    content: replyText,
                    source: "survey",
                  })
                );
              }
              deferred.push(recalcFriendScore(supabase, friend.id));
              break;
            }

            if (builtin === "points") {
              // 残高は findOrCreateFriend で取得済みの値を使う（再クエリしない＝応答高速化）
              const pts = friend.points || 0;

              // 次の特典までの残りを案内（同じアカウントの特典のみ）
              let nextRewardQuery = supabase
                .from("point_rewards")
                .select("threshold, title")
                .eq("active", true)
                .gt("threshold", pts)
                .order("threshold", { ascending: true })
                .limit(1);
              if (accountId) {
                nextRewardQuery = nextRewardQuery.eq("account_id", accountId);
              }
              const { data: nextRewards } = await nextRewardQuery;
              const nextReward = nextRewards?.[0];

              let replyText = `💎 ${friend.display_name || "あなた"}さんの現在のポイント：${pts}pt`;
              if (nextReward) {
                replyText += `\n\n次の特典「${nextReward.title}」まであと ${nextReward.threshold - pts}pt！`;
              }
              replyText +=
                "\n\n【ポイントの貯め方】\n・配信で紹介するリンクをチェック → 5pt\n・アンケート（1分問診）に回答 → 最大24pt\n・配信のキーワード企画に参加 → 企画ごとに案内\n\n貯まったポイントは、資料室の🔒ポイント特典と交換できます📚（交換ページは現在調整中です。準備ができ次第ご案内します）";
              const sent = await pushMessage(userId, replyText, "points", token);
              if (sent === null) break;
              deferred.push(
                logMessage(supabase, friend.id, {
                  direction: "out",
                  content: replyText,
                  source: "system",
                })
              );
              break;
            }

            // === 3) キーワード自動応答 ===
            const autoReply = await findAutoReply(
              supabase,
              friend.id,
              inboundText,
              accountId
            );
            if (autoReply) {
              const sent = await pushMessage(userId, autoReply.reply_text, "keyword_reply", token);
              deferred.push(
                ...(sent === null ? [] : [logMessage(supabase, friend.id, {
                  direction: "out",
                  content: autoReply.reply_text,
                  source: "auto_reply",
                  metadata: { reply_id: autoReply.id, name: autoReply.name },
                })]),
                logEvent(supabase, friend.id, "keyword_reply", {
                  reply_id: autoReply.id,
                  name: autoReply.name,
                  keyword_text: inboundText,
                })
              );

              if (autoReply.cascade === true) {
                // タグ付与
                const addTags = (autoReply.add_tags || []).filter(Boolean);
                if (addTags.length > 0) {
                  const currentTags: string[] = friend.tags || [];
                  const merged = [
                    ...currentTags,
                    ...addTags.filter((t) => !currentTags.includes(t)),
                  ];
                  if (merged.length !== currentTags.length) {
                    await supabase
                      .from("friends")
                      .update({ tags: merged })
                      .eq("id", friend.id);
                    await enrollMatchingStepFlows(
                      supabase,
                      friend.id,
                      merged,
                      accountId,
                      "keyword_reply"
                    );
                  }
                }

                // ポイント付与
                if (autoReply.points > 0) {
                  await awardPoints(
                    supabase,
                    { id: friend.id, line_user_id: userId },
                    autoReply.points,
                    `キーワード「${autoReply.name}」`,
                    { reply_id: autoReply.id }
                  );
                }
              }
            }
          }

          // デイリーメッセージポイントは廃止（2026-07-13 オーナー決定・配信への反応でのみ貯まる方針）

          deferred.push(recalcFriendScore(supabase, friend.id));
          } finally {
            // break でも throw でもここは必ず通る（serverless: レスポンス前に全タスク完了を保証）
            deferred.push(
              Promise.resolve(
                supabase
                  .from("friends")
                  .update({ last_active_at: new Date().toISOString() })
                  .eq("id", friend.id)
              )
            );
            const results = await Promise.allSettled(deferred);
            for (const r of results) {
              if (r.status === "rejected") {
                console.error("deferred task failed:", r.reason);
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("Webhook event error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
