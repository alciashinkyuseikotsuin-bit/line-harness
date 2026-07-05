import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getUserProfile } from "@/lib/line";
import { getAccountFromRequest, resolveToken } from "@/lib/accounts";

// LINE APIからフォロワー一覧を取得してDBに同期
// ※ getFollowers APIが403の場合はDBの既存友だちのプロフィールを更新
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const account = await getAccountFromRequest(supabase, request);
  const accountId = account?.id;
  const token = resolveToken(account);

  try {
    // DBに登録済みの友だちのプロフィールを最新に更新
    let friendsQuery = supabase
      .from("friends")
      .select("id, line_user_id")
      .eq("is_blocked", false);
    if (accountId) {
      friendsQuery = friendsQuery.eq("account_id", accountId);
    }
    const { data: friends } = await friendsQuery;

    let synced = 0;
    let failed = 0;

    for (const friend of friends || []) {
      try {
        const profile = await getUserProfile(friend.line_user_id, token);
        await supabase
          .from("friends")
          .update({
            display_name: profile.displayName,
            picture_url: profile.pictureUrl || null,
            status_message: profile.statusMessage || null,
            last_active_at: new Date().toISOString(),
          })
          .eq("id", friend.id);
        synced++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      total: (friends || []).length,
      synced,
      failed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "同期に失敗しました" },
      { status: 500 }
    );
  }
}
