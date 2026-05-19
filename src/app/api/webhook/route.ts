import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getUserProfile,
  pushMessage,
  pushMessages,
  multicastMessage,
  buildSurveyFlexMessage,
} from "@/lib/line";
import { enrollMatchingStepFlows } from "@/lib/step-enrollment";

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
          await supabase.from("friends").upsert(
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
          );
          break;
        }

        case "unfollow": {
          // ブロック
          await supabase
            .from("friends")
            .update({ is_blocked: true })
            .eq("line_user_id", event.source.userId);
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
            // 友だち情報取得（未登録なら自動登録）
            let { data: friend } = await supabase
              .from("friends")
              .select("id")
              .eq("line_user_id", pbUserId)
              .single();

            if (!friend) {
              const pbProfile = await getUserProfile(pbUserId);
              const { data: newFriend } = await supabase.from("friends").upsert(
                {
                  line_user_id: pbUserId,
                  display_name: pbProfile.displayName,
                  picture_url: pbProfile.pictureUrl,
                  status_message: pbProfile.statusMessage,
                  is_blocked: false,
                  joined_at: new Date().toISOString(),
                  last_active_at: new Date().toISOString(),
                },
                { onConflict: "line_user_id" }
              ).select("id").single();
              friend = newFriend;
            }

            if (friend) {
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

              // === 並列で取得: choice / friend tags / アンケート設問一覧 / 既回答 / completion_message ===
              const [
                choiceRes,
                currentFriendRes,
                allQuestionsRes,
                answeredRes,
                surveyRes,
              ] = await Promise.all([
                supabase
                  .from("survey_choices")
                  .select("tag, broadcast_message")
                  .eq("id", choiceId)
                  .single(),
                supabase
                  .from("friends")
                  .select("tags")
                  .eq("id", friend.id)
                  .single(),
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
                  .eq("friend_id", friend.id),
                supabase
                  .from("surveys")
                  .select("completion_message")
                  .eq("id", surveyId)
                  .single(),
              ]);

              const choice = choiceRes.data;

              if (choice?.tag) {
                // タグ追加（既存に含まれていなければ）
                const currentTags: string[] = currentFriendRes.data?.tags || [];
                const updatedTags = currentTags.includes(choice.tag)
                  ? currentTags
                  : [...currentTags, choice.tag];

                const isFreeInputChoice =
                  !!choice.broadcast_message && choice.tag.includes("その他");

                // バックグラウンドタスク（友だちレコード更新・ステップフロー登録）を即発火
                // メッセージ送信前に await する必要がないので、Promise.all で並列実行する
                const friendUpdate: Record<string, unknown> = {};
                if (!currentTags.includes(choice.tag)) {
                  friendUpdate.tags = updatedTags;
                }
                if (isFreeInputChoice) {
                  friendUpdate.pending_input = {
                    type: "free_tag",
                    base_tag: choice.tag.replace(":その他", ""),
                    prompt: choice.broadcast_message,
                    survey_id: surveyId,
                    question_id: questionId,
                  };
                }

                const bgTasks: Promise<unknown>[] = [];
                if (Object.keys(friendUpdate).length > 0) {
                  bgTasks.push(
                    Promise.resolve(
                      supabase.from("friends").update(friendUpdate).eq("id", friend.id)
                    )
                  );
                }
                bgTasks.push(
                  enrollMatchingStepFlows(supabase, friend.id, updatedTags)
                );

                // === 送信メッセージを一度に組み立てて 1 回の pushMessages で送る ===
                // 1) 選択肢の自動返信（あれば）
                // 2) 次質問の Flex（あれば） または 完了メッセージ（最終回答時）
                const messagesToSend: unknown[] = [];

                if (choice.broadcast_message) {
                  messagesToSend.push({
                    type: "text",
                    text: choice.broadcast_message,
                  });
                }

                if (isFreeInputChoice) {
                  // 自由記入待ち。次質問は message event 側で送る
                } else {
                  const allQuestions = (allQuestionsRes.data || []) as unknown as {
                    id: string;
                    question_text: string;
                    sort_order: number;
                    survey_choices: { id: string; choice_text: string; sort_order: number }[];
                  }[];
                  const currentQ = allQuestions.find((q) => q.id === questionId);
                  const answeredIds = new Set(
                    (answeredRes.data || []).map(
                      (a: { question_id: string }) => a.question_id
                    )
                  );
                  // 今回の回答も加える（responses 取得が並列なのでまだ含まれていない可能性がある）
                  answeredIds.add(questionId);

                  const nextQ = currentQ
                    ? allQuestions
                        .filter((q) => q.sort_order > currentQ.sort_order)
                        .find((q) => !answeredIds.has(q.id))
                    : undefined;

                  if (nextQ) {
                    const sortedChoices = (nextQ.survey_choices || [])
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((c) => ({ id: c.id, text: c.choice_text }));
                    messagesToSend.push(
                      buildSurveyFlexMessage(
                        surveyId,
                        nextQ.id,
                        nextQ.question_text,
                        sortedChoices
                      )
                    );
                  } else {
                    // 次質問なし = 全質問回答完了。完了メッセージがあれば送る
                    const completionMessage = surveyRes.data?.completion_message;
                    if (completionMessage && completionMessage.trim()) {
                      messagesToSend.push({ type: "text", text: completionMessage });
                    }
                  }
                }

                // 送信（LINE は1リクエストで最大5メッセージ。本処理では最大2つなので余裕）
                if (messagesToSend.length > 0) {
                  try {
                    await pushMessages(pbUserId, messagesToSend);
                  } catch (err) {
                    console.error("push 失敗:", err);
                  }
                }

                // バックグラウンドタスクは送信後に完了を待つ（webhook の200返しが遅れない範囲）
                await Promise.allSettled(bgTasks);
              }
            }
          }
          break;
        }

        case "message": {
          // メッセージ受信時
          const userId = event.source.userId;
          if (userId) {
            const { data: existing } = await supabase
              .from("friends")
              .select("id, tags, pending_input")
              .eq("line_user_id", userId)
              .single();

            if (existing) {
              // 自由記入待ち状態のチェック
              if (
                existing.pending_input &&
                (existing.pending_input as any).type === "free_tag" &&
                event.message?.type === "text" &&
                event.message?.text
              ) {
                const inputText = event.message.text.trim();
                const baseTag = (existing.pending_input as any).base_tag || "業種";
                const newTag = `${baseTag}:${inputText}`;
                const currentTags: string[] = existing.tags || [];

                // 「その他」タグを削除して、入力された業種タグに置き換え
                const updatedTags = currentTags
                  .filter((t: string) => !t.includes("その他"))
                  .concat(newTag);

                await supabase
                  .from("friends")
                  .update({
                    tags: updatedTags,
                    pending_input: null,
                    last_active_at: new Date().toISOString(),
                  })
                  .eq("id", existing.id);

                await pushMessage(userId, `「${inputText}」で登録しました！ありがとうございます。`);

                // 更新後タグセットでステップフローのトリガー再評価
                await enrollMatchingStepFlows(supabase, existing.id, updatedTags);

                // 自由記入が含まれていたアンケートの次質問 / 完了メッセージを送る
                const pi = existing.pending_input as {
                  type: string;
                  survey_id?: string;
                  question_id?: string;
                };
                if (pi.survey_id && pi.question_id) {
                  try {
                    const [allQuestionsRes2, answeredRes2, surveyRes2] =
                      await Promise.all([
                        supabase
                          .from("survey_questions")
                          .select(
                            `id, question_text, sort_order,
                             survey_choices ( id, choice_text, sort_order )`
                          )
                          .eq("survey_id", pi.survey_id)
                          .order("sort_order", { ascending: true }),
                        supabase
                          .from("survey_responses")
                          .select("question_id")
                          .eq("survey_id", pi.survey_id)
                          .eq("friend_id", existing.id),
                        supabase
                          .from("surveys")
                          .select("completion_message")
                          .eq("id", pi.survey_id)
                          .single(),
                      ]);

                    const allQs = (allQuestionsRes2.data || []) as unknown as {
                      id: string;
                      question_text: string;
                      sort_order: number;
                      survey_choices: { id: string; choice_text: string; sort_order: number }[];
                    }[];
                    const currentQ = allQs.find((q) => q.id === pi.question_id);
                    const answeredIds = new Set(
                      (answeredRes2.data || []).map(
                        (a: { question_id: string }) => a.question_id
                      )
                    );
                    answeredIds.add(pi.question_id);

                    const nextQ = currentQ
                      ? allQs
                          .filter((q) => q.sort_order > currentQ.sort_order)
                          .find((q) => !answeredIds.has(q.id))
                      : undefined;

                    if (nextQ) {
                      const sortedChoices = (nextQ.survey_choices || [])
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((c) => ({ id: c.id, text: c.choice_text }));
                      await pushMessages(userId, [
                        buildSurveyFlexMessage(
                          pi.survey_id,
                          nextQ.id,
                          nextQ.question_text,
                          sortedChoices
                        ),
                      ]);
                    } else {
                      const completionMessage = surveyRes2.data?.completion_message;
                      if (completionMessage && completionMessage.trim()) {
                        await pushMessage(userId, completionMessage);
                      }
                    }
                  } catch (nextErr) {
                    console.error("自由記入後の次質問/完了送信エラー:", nextErr);
                  }
                }
              } else {
                // 通常：最終アクティブ更新 + pending_inputクリア不要
                await supabase
                  .from("friends")
                  .update({ last_active_at: new Date().toISOString() })
                  .eq("line_user_id", userId);
              }
            } else {
              // 未登録：プロフィール取得して新規登録
              const msgProfile = await getUserProfile(userId);
              await supabase.from("friends").upsert(
                {
                  line_user_id: userId,
                  display_name: msgProfile.displayName,
                  picture_url: msgProfile.pictureUrl,
                  status_message: msgProfile.statusMessage,
                  is_blocked: false,
                  joined_at: new Date().toISOString(),
                  last_active_at: new Date().toISOString(),
                },
                { onConflict: "line_user_id" }
              );
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
