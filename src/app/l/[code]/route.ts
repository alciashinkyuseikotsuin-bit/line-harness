import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logEvent } from "@/lib/logging";
import { awardPoints } from "@/lib/points";
import { enrollMatchingStepFlows } from "@/lib/step-enrollment";

/**
 * 計測リンクのリダイレクト
 * /l/{code}?f={friendId}
 *
 * - クリックを link_clicks に記録
 * - friend が特定できれば friend_events / タグ付与 / ポイント付与
 * - 最後に 302 リダイレクト（記録に失敗しても必ず飛ばす）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const friendId = request.nextUrl.searchParams.get("f");

  const supabase = getSupabaseAdmin();

  const { data: link } = await supabase
    .from("tracked_links")
    .select("id, dest_url, add_tag, points, click_count")
    .eq("code", code)
    .single();

  if (!link) {
    // リンクが見つからない場合はトップへ
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  try {
    await supabase.from("link_clicks").insert({
      link_id: link.id,
      friend_id: friendId || null,
    });
    await supabase
      .from("tracked_links")
      .update({ click_count: (link.click_count || 0) + 1 })
      .eq("id", link.id);

    if (friendId) {
      const { data: friend } = await supabase
        .from("friends")
        .select("id, line_user_id, tags")
        .eq("id", friendId)
        .single();

      if (friend) {
        // ポイントは「同じリンクの初回クリックのみ」付与（連打でのpt稼ぎを防ぐ）。
        // 直前に自分のクリックを insert 済みなので、2件以上あれば過去にクリックがある。
        const { count: priorClicks } = await supabase
          .from("link_clicks")
          .select("*", { count: "exact", head: true })
          .eq("link_id", link.id)
          .eq("friend_id", friend.id);
        const isFirstClick = (priorClicks || 0) <= 1;

        await logEvent(supabase, friend.id, "link_click", {
          link_id: link.id,
          code,
        });

        // 最終アクティブも更新（クリックは立派なアクション）
        await supabase
          .from("friends")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", friend.id);

        // タグ付与
        if (link.add_tag) {
          const currentTags: string[] = friend.tags || [];
          if (!currentTags.includes(link.add_tag)) {
            const merged = [...currentTags, link.add_tag];
            await supabase
              .from("friends")
              .update({ tags: merged })
              .eq("id", friend.id);
            await enrollMatchingStepFlows(supabase, friend.id, merged);
          }
        }

        // ポイント付与（リンク個別設定。0なら付与なし・同一リンクは初回のみ）
        if (link.points > 0 && isFirstClick) {
          await awardPoints(
            supabase,
            { id: friend.id, line_user_id: friend.line_user_id },
            link.points,
            "リンククリック",
            { link_id: link.id, code }
          );
        }
      }
    }
  } catch (err) {
    console.error("リンククリック記録エラー:", err);
  }

  return NextResponse.redirect(link.dest_url, 302);
}
