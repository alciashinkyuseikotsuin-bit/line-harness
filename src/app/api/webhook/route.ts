import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getUserProfile, pushMessage, multicastMessage } from "@/lib/line";

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
                if (!currentTags.includes(choice.tag)) {
                  await supabase
                    .from("friends")
                    .update({ tags: [...currentTags, choice.tag] })
                    .eq("id", friend.id);
                }

                // 自由記入チェック（isFreeInput フラグ）
                if (choice.broadcast_message && choice.tag.includes("その他")) {
                  // 「その他」選択 → 自由記入待ち状態にする
                  await supabase
                    .from("friends")
                    .update({
                      pending_input: {
                        type: "free_tag",
                        base_tag: choice.tag.replace(":その他", ""),
                        prompt: choice.broadcast_message,
                      },
                    })
                    .eq("id", friend.id);
                  await pushMessage(pbUserId, choice.broadcast_message);
                } else if (choice.broadcast_message) {
                  // 通常の自動返信
                  await pushMessage(pbUserId, choice.broadcast_message);
                }

                // ステップフローのトリガーチェック
                const { data: flows } = await supabase
                  .from("step_flows")
                  .select("id")
                  .eq("trigger_tag", choice.tag)
                  .eq("status", "active");

                if (flows && flows.length > 0) {
                  for (const flow of flows) {
                    const { data: firstStep } = await supabase
                      .from("step_messages")
                      .select("delay_minutes")
                      .eq("flow_id", flow.id)
                      .order("sort_order", { ascending: true })
                      .limit(1)
                      .single();

                    const nextSendAt = new Date();
                    if (firstStep) {
                      nextSendAt.setMinutes(nextSendAt.getMinutes() + firstStep.delay_minutes);
                    }

                    await supabase.from("step_enrollments").upsert(
                      {
                        flow_id: flow.id,
                        friend_id: friend.id,
                        current_step: 0,
                        status: "active",
                        enrolled_at: new Date().toISOString(),
                        next_send_at: nextSendAt.toISOString(),
                      },
                      { onConflict: "flow_id,friend_id" }
                    );
                  }
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
