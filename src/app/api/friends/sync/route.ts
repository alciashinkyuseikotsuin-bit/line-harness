import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLineClient, getUserProfile } from "@/lib/line";

// LINE APIからフォロワー一覧を取得してDBに同期
export async function POST() {
  const supabase = getSupabaseAdmin();
  const client = getLineClient();

  try {
    // フォロワーIDを全件取得（ページネーション対応）
    const allUserIds: string[] = [];
    let continuationToken: string | undefined;

    do {
      const res = await client.getFollowers(continuationToken, 1000);
      allUserIds.push(...(res.userIds || []));
      continuationToken = res.next || undefined;
    } while (continuationToken);

    // 各ユーザーのプロフィールを取得してDBに保存
    let synced = 0;
    let failed = 0;

    for (const userId of allUserIds) {
      try {
        // 既にDBにいるかチェック
        const { data: existing } = await supabase
          .from("friends")
          .select("id")
          .eq("line_user_id", userId)
          .single();

        if (existing) {
          // 既存ユーザーはプロフィール更新のみ
          const profile = await getUserProfile(userId);
          await supabase
            .from("friends")
            .update({
              display_name: profile.displayName,
              picture_url: profile.pictureUrl || null,
              status_message: profile.statusMessage || null,
              is_blocked: false,
              last_active_at: new Date().toISOString(),
            })
            .eq("line_user_id", userId);
          synced++;
        } else {
          // 新規ユーザーを追加
          const profile = await getUserProfile(userId);
          await supabase.from("friends").insert({
            line_user_id: userId,
            display_name: profile.displayName,
            picture_url: profile.pictureUrl || null,
            status_message: profile.statusMessage || null,
            is_blocked: false,
            joined_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
            tags: [],
          });
          synced++;
        }
      } catch (err) {
        // プロフィール取得失敗（ブロック済みユーザー等）
        failed++;
      }
    }

    return NextResponse.json({
      total: allUserIds.length,
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
