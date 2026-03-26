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
          const data = new URLSearchParams(event.source.userId ? event.postback.data : "");
          const surveyId = data.get("survey");
          const questionId = data.get("question");
          const choiceId = data.get("choice");

          if (surveyId && questionId && choiceId) {
            // 友だち情報取得
            const { data: friend } = await supabase
              .from("friends")
              .select("id")
              .eq("line_user_id", event.source.userId)
              .single();

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

                // 自動配信メッセージがあれば送信
                if (choice.broadcast_message) {
                  await pushMessage(
                    event.source.userId,
                    choice.broadcast_message
                  );
                }
              }
            }
          }
          break;
        }

        case "message": {
          // メッセージ受信時：最終アクティブ更新
          await supabase
            .from("friends")
            .update({ last_active_at: new Date().toISOString() })
            .eq("line_user_id", event.source.userId);
          break;
        }
      }
    } catch (err) {
      console.error("Webhook event error:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
