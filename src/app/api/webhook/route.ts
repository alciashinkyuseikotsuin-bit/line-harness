import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getUserProfile, pushMessage, multicastMessage, sendSurveyMessage } from "@/lib/line";
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

              // 選択肢のタグを取得して友だちにタグ付け
              const { data: choice } = await supabase
                .from("survey_choices")
                .select("tag, broadcast_message")
                .eq("id", choiceId)
                .single();

              if (choice?.tag) {
                // タグ追加
                const { data: currentFriend } = await supabase
                  .from("friends")
                  .select("tags")
                  .eq("id", friend.id)
                  .single();

                const currentTags: string[] = currentFriend?.tags || [];
                const updatedTags = currentTags.includes(choice.tag)
                  ? currentTags
                  : [...currentTags, choice.tag];
                if (!currentTags.includes(choice.tag)) {
                  await supabase
                    .from("friends")
                    .update({ tags: updatedTags })
                    .eq("id", friend.id);
                }

                // 自由記入チェック（isFreeInput フラグ）
                const isFreeInputChoice =
                  choice.broadcast_message && choice.tag.includes("その他");

                if (isFreeInputChoice) {
                  // 「その他」選択 → 自由記入待ち状態にする
                  // 次質問送信は自由記入完了後（message event 側）で行う
                  await supabase
                    .from("friends")
                    .update({
                      pending_input: {
                        type: "free_tag",
                        base_tag: choice.tag.replace(":その他", ""),
                        prompt: choice.broadcast_message,
                        survey_id: surveyId,
                        question_id: questionId,
                      },
                    })
                    .eq("id", friend.id);
                  await pushMessage(pbUserId, choice.broadcast_message);
                } else if (choice.broadcast_message) {
                  // 通常の自動返信
                  await pushMessage(pbUserId, choice.broadcast_message);
                }

                // 更新後タグセットでステップフローのトリガーチェック（複数タグ + AND/OR対応）
                await enrollMatchingStepFlows(supabase, friend.id, updatedTags);

                // 自由記入待ちの場合は次質問を送らない（message event 側で送る）
                if (isFreeInputChoice) {
                  break;
                }

                // 次の質問を送る（同じアンケート内で sort_order が今より大きい未回答のうち最小）
                try {
                  const { data: currentQ } = await supabase
                    .from("survey_questions")
                    .select("sort_order")
                    .eq("id", questionId)
                    .single();

                  if (currentQ) {
                    const { data: nextQuestions } = await supabase
                      .from("survey_questions")
                      .select(
                        `id, question_text, sort_order,
                         survey_choices ( id, choice_text, sort_order )`
                      )
                      .eq("survey_id", surveyId)
                      .gt("sort_order", currentQ.sort_order)
                      .order("sort_order", { ascending: true });

                    // この友だちが既に回答済みの question_id を取得
                    const { data: answered } = await supabase
                      .from("survey_responses")
                      .select("question_id")
                      .eq("survey_id", surveyId)
                      .eq("friend_id", friend.id);
                    const answeredIds = new Set(
                      (answered || []).map((a: { question_id: string }) => a.question_id)
                    );

                    const nextQ = (nextQuestions || []).find(
                      (q: { id: string }) => !answeredIds.has(q.id)
                    );

                    if (nextQ) {
                      const sortedChoices = ((nextQ as unknown as {
                        survey_choices: { id: string; choice_text: string; sort_order: number }[];
                      }).survey_choices || [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((c) => ({ id: c.id, text: c.choice_text }));

                      await sendSurveyMessage(
                        pbUserId,
                        surveyId,
                        (nextQ as { id: string }).id,
                        (nextQ as { question_text: string }).question_text,
                        sortedChoices
                      );
                    }
                  }
                } catch (nextErr) {
                  console.error("次質問送信エラー:", nextErr);
                }
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

                // 自由記入が含まれていたアンケートの次質問を送る
                const pi = existing.pending_input as {
                  type: string;
                  survey_id?: string;
                  question_id?: string;
                };
                if (pi.survey_id && pi.question_id) {
                  try {
                    const { data: currentQ } = await supabase
                      .from("survey_questions")
                      .select("sort_order")
                      .eq("id", pi.question_id)
                      .single();

                    if (currentQ) {
                      const { data: nextQuestions } = await supabase
                        .from("survey_questions")
                        .select(
                          `id, question_text, sort_order,
                           survey_choices ( id, choice_text, sort_order )`
                        )
                        .eq("survey_id", pi.survey_id)
                        .gt("sort_order", currentQ.sort_order)
                        .order("sort_order", { ascending: true });

                      const { data: answered } = await supabase
                        .from("survey_responses")
                        .select("question_id")
                        .eq("survey_id", pi.survey_id)
                        .eq("friend_id", existing.id);
                      const answeredIds = new Set(
                        (answered || []).map(
                          (a: { question_id: string }) => a.question_id
                        )
                      );

                      const nextQ = (nextQuestions || []).find(
                        (q: { id: string }) => !answeredIds.has(q.id)
                      );

                      if (nextQ) {
                        const sortedChoices = ((nextQ as unknown as {
                          survey_choices: { id: string; choice_text: string; sort_order: number }[];
                        }).survey_choices || [])
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((c) => ({ id: c.id, text: c.choice_text }));

                        await sendSurveyMessage(
                          userId,
                          pi.survey_id,
                          (nextQ as { id: string }).id,
                          (nextQ as { question_text: string }).question_text,
                          sortedChoices
                        );
                      }
                    }
                  } catch (nextErr) {
                    console.error("自由記入後の次質問送信エラー:", nextErr);
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
