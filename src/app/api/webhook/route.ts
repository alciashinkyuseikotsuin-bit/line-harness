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
  jstToday,
} from "@/lib/engage";
import { computeDiagnosisResult } from "@/lib/diagnosis";
import type { SupabaseClient } from "@supabase/supabase-js";

// LINE署名検証
function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

type FriendRow = {
  id: string;
  line_user_id: string;
  tags: string[] | null;
  pending_input: Record<string, unknown> | null;
  display_name: string | null;
};

// 友だちを取得。未登録ならプロフィールを取得して登録する
async function findOrCreateFriend(
  supabase: SupabaseClient,
  lineUserId: string
): Promise<FriendRow | null> {
  const { data: existing } = await supabase
    .from("friends")
    .select("id, line_user_id, tags, pending_input, display_name")
    .eq("line_user_id", lineUserId)
    .single();
  if (existing) return existing as FriendRow;

  try {
    const profile = await getUserProfile(lineUserId);
    const { data: created } = await supabase
      .from("friends")
      .upsert(
        {
          line_user_id: lineUserId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          status_message: profile.statusMessage,
          is_blocked: false,
          joined_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
        },
        { onConflict: "line_user_id" }
      )
      .select("id, line_user_id, tags, pending_input, display_name")
      .single();
    return created as FriendRow | null;
  } catch (err) {
    console.error("友だち登録失敗:", err);
    return null;
  }
}

// アンケートの次質問 or 完了処理（診断結果・完了メッセージ）を組み立てる
// 戻り値: 送信するメッセージ配列と、診断で付与するタグ
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
  }

  return { messages, addTag, completed };
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  // 署名検証
  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { events } = JSON.parse(body);
  const supabase = getSupabaseAdmin();

  for (const event of events) {
    try {
      switch (event.type) {
        case "follow": {
          // 友だち追加
          const profile = await getUserProfile(event.source.userId);
          const { data: followed } = await supabase
            .from("friends")
            .upsert(
              {
                line_user_id: event.source.userId,
                display_name: profile.displayName,
                picture_url: profile.pictureUrl,
                status_message: profile.statusMessage,
                is_blocked: false,
                joined_at: new Date().toISOString(),
                last_active_at: new Date().toISOString(),
              },
              { onConflict: "line_user_id" }
            )
            .select("id")
            .single();
          if (followed) {
            await logEvent(supabase, followed.id, "follow", {});
          }
          break;
        }

        case "unfollow": {
          // ブロック
          const { data: unfollowed } = await supabase
            .from("friends")
            .update({ is_blocked: true })
            .eq("line_user_id", event.source.userId)
            .select("id")
            .single();
          if (unfollowed) {
            await logEvent(supabase, unfollowed.id, "unfollow", {});
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
            const friend = await findOrCreateFriend(supabase, pbUserId);
            if (!friend) break;

            // 回答を保存
            await supabase.from("survey_responses").upsert(
              {
                survey_id: surveyId,
                question_id: questionId,
                choice_id: choiceId,
                friend_id: friend.id,
                responded_at: new Date().toISOString(),
              },
              { onConflict: "friend_id,question_id" }
            );

            const [choiceRes, currentFriendRes] = await Promise.all([
              supabase
                .from("survey_choices")
                .select("tag, broadcast_message, choice_text")
                .eq("id", choiceId)
                .single(),
              supabase
                .from("friends")
                .select("tags")
                .eq("id", friend.id)
                .single(),
            ]);

            const choice = choiceRes.data;
            if (!choice) break;

            // 回答ログ
            await logEvent(supabase, friend.id, "survey_answer", {
              survey_id: surveyId,
              question_id: questionId,
              choice_id: choiceId,
              choice_text: choice.choice_text,
            });
            await logMessage(supabase, friend.id, {
              direction: "in",
              content: choice.choice_text,
              source: "survey",
              metadata: { survey_id: surveyId, question_id: questionId },
            });

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

            // 友だちレコード更新
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
            await supabase.from("friends").update(friendUpdate).eq("id", friend.id);

            // === 送信メッセージを組み立てて 1 回の pushMessages で送る ===
            const messagesToSend: unknown[] = [];
            if (choice.broadcast_message) {
              messagesToSend.push({ type: "text", text: choice.broadcast_message });
            }
            messagesToSend.push(...nextStep.messages);

            if (messagesToSend.length > 0) {
              try {
                await pushMessages(pbUserId, messagesToSend);
                await logMessage(supabase, friend.id, {
                  direction: "out",
                  content: messagesToSend
                    .map((m) => {
                      const msg = m as { type: string; text?: string; altText?: string };
                      return msg.type === "text" ? msg.text : msg.altText || `[${msg.type}]`;
                    })
                    .join("\n"),
                  source: nextStep.completed ? "diagnosis" : "survey",
                  metadata: { survey_id: surveyId },
                });
              } catch (err) {
                console.error("push 失敗:", err);
              }
            }

            // バックグラウンド処理: ステップフロー登録・ポイント付与・スコア再計算
            const rules = await getPointRules(supabase);
            const bgTasks: Promise<unknown>[] = [
              enrollMatchingStepFlows(supabase, friend.id, updatedTags),
            ];
            if (rules.survey_answer > 0) {
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
            await Promise.allSettled(bgTasks);
            await recalcFriendScore(supabase, friend.id);
          }
          break;
        }

        case "message": {
          const userId = event.source.userId;
          if (!userId) break;

          const friend = await findOrCreateFriend(supabase, userId);
          if (!friend) break;

          const isText = event.message?.type === "text" && !!event.message?.text;
          const inboundText: string = isText ? event.message.text : "";

          // === デイリーポイント判定用: 今日（JST）の受信が既にあるか（ログ記録前に確認） ===
          const jstDayStartUtc = new Date(`${jstToday()}T00:00:00+09:00`).toISOString();
          const { count: todayInbound } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("friend_id", friend.id)
            .eq("direction", "in")
            .gte("created_at", jstDayStartUtc);
          const isFirstMessageToday = (todayInbound || 0) === 0;

          // 受信ログ（テキスト以外もタイプを記録）
          await logMessage(supabase, friend.id, {
            direction: "in",
            messageType: event.message?.type || "unknown",
            content: isText ? inboundText : `[${event.message?.type || "unknown"}]`,
            source: "webhook",
          });
          await logEvent(supabase, friend.id, "message", {
            message_type: event.message?.type || "unknown",
          });

          // 最終アクティブ更新
          await supabase
            .from("friends")
            .update({ last_active_at: new Date().toISOString() })
            .eq("id", friend.id);

          const rules = await getPointRules(supabase);

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
            await pushMessage(userId, ackText);
            await logMessage(supabase, friend.id, {
              direction: "out",
              content: ackText,
              source: "survey",
            });

            await enrollMatchingStepFlows(supabase, friend.id, updatedTags);

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
                  await enrollMatchingStepFlows(supabase, friend.id, withDiagTag);
                }
                if (nextStep.messages.length > 0) {
                  await pushMessages(userId, nextStep.messages);
                }
              } catch (nextErr) {
                console.error("自由記入後の次質問/完了送信エラー:", nextErr);
              }
            }
            await recalcFriendScore(supabase, friend.id);
            break;
          }

          if (isText) {
            // === 2) 組み込みコマンド（おみくじ・ポイント確認）===
            const builtin = detectBuiltinCommand(inboundText);

            if (builtin === "omikuji") {
              const result = await drawOmikuji(supabase, friend.id);
              let replyText: string;
              if (result.status === "drawn") {
                replyText = `⛩️ 今日の運勢は…\n\n【${result.fortune}】\n\n${result.message}`;
                await logEvent(supabase, friend.id, "omikuji", {
                  fortune: result.fortune,
                  item_id: result.itemId,
                });
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
              await pushMessage(userId, replyText);
              await logMessage(supabase, friend.id, {
                direction: "out",
                content: replyText,
                source: "omikuji",
              });
              await recalcFriendScore(supabase, friend.id);
              break;
            }

            if (builtin === "points") {
              const { data: f } = await supabase
                .from("friends")
                .select("points")
                .eq("id", friend.id)
                .single();
              const pts = f?.points || 0;

              // 次の特典までの残りを案内
              const { data: nextReward } = await supabase
                .from("point_rewards")
                .select("threshold, title")
                .eq("active", true)
                .gt("threshold", pts)
                .order("threshold", { ascending: true })
                .limit(1)
                .single();

              let replyText = `💎 ${friend.display_name || "あなた"}さんの現在のポイント：${pts}pt`;
              if (nextReward) {
                replyText += `\n\n次の特典「${nextReward.title}」まであと ${nextReward.threshold - pts}pt！`;
              }
              await pushMessage(userId, replyText);
              await logMessage(supabase, friend.id, {
                direction: "out",
                content: replyText,
                source: "system",
              });
              break;
            }

            // === 3) キーワード自動応答 ===
            const autoReply = await findAutoReply(supabase, friend.id, inboundText);
            if (autoReply) {
              await pushMessage(userId, autoReply.reply_text);
              await logMessage(supabase, friend.id, {
                direction: "out",
                content: autoReply.reply_text,
                source: "auto_reply",
                metadata: { reply_id: autoReply.id, name: autoReply.name },
              });
              await logEvent(supabase, friend.id, "keyword_reply", {
                reply_id: autoReply.id,
                name: autoReply.name,
                keyword_text: inboundText,
              });

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
                  await enrollMatchingStepFlows(supabase, friend.id, merged);
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

          // === 4) 今日はじめてのメッセージにデイリーポイント ===
          if (isFirstMessageToday && rules.daily_message > 0) {
            await awardPoints(
              supabase,
              { id: friend.id, line_user_id: userId },
              rules.daily_message,
              "デイリーメッセージ",
              {}
            );
          }

          await recalcFriendScore(supabase, friend.id);
          break;
        }
      }
    } catch (err) {
      console.error("Webhook event error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
