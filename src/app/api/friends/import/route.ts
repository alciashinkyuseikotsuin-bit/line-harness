import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getUserProfile } from "@/lib/line";

// CSVテキストをパース
function parseCSV(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}

// ヘッダー名からLINE User IDカラムを自動検出
function findUserIdColumn(headers: string[]): string | null {
  const candidates = [
    "line_user_id",
    "userId",
    "user_id",
    "LINEユーザーID",
    "ユーザーID",
    "LINE User ID",
    "PosterユーザーID",
  ];
  for (const c of candidates) {
    const found = headers.find(
      (h) => h.toLowerCase() === c.toLowerCase() || h === c
    );
    if (found) return found;
  }
  // Uから始まる33文字のIDが入っている最初のカラムを探す
  return null;
}

// ヘッダー名から表示名カラムを自動検出
function findDisplayNameColumn(headers: string[]): string | null {
  const candidates = [
    "display_name",
    "displayName",
    "表示名",
    "LINE登録名",
    "ニックネーム",
    "名前",
    "本名",
    "システム表示名",
  ];
  for (const c of candidates) {
    const found = headers.find(
      (h) => h.toLowerCase() === c.toLowerCase() || h === c
    );
    if (found) return found;
  }
  return null;
}

// ヘッダー名からタグカラムを自動検出
function findTagsColumn(headers: string[]): string | null {
  const candidates = ["tags", "タグ"];
  for (const c of candidates) {
    const found = headers.find(
      (h) => h.toLowerCase() === c.toLowerCase() || h === c
    );
    if (found) return found;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSVにデータがありません（ヘッダー行 + 1行以上必要）" },
        { status: 400 }
      );
    }

    const headers = Object.keys(rows[0]);
    const userIdCol = findUserIdColumn(headers);
    const displayNameCol = findDisplayNameColumn(headers);
    const tagsCol = findTagsColumn(headers);

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const lineUserId = userIdCol ? row[userIdCol]?.trim() : "";
        const displayName = displayNameCol ? row[displayNameCol]?.trim() : "";
        const tagsRaw = tagsCol ? row[tagsCol]?.trim() : "";

        // LINE User IDがある場合
        if (lineUserId && lineUserId.startsWith("U") && lineUserId.length >= 30) {
          // 既存チェック
          const { data: existing } = await supabase
            .from("friends")
            .select("id")
            .eq("line_user_id", lineUserId)
            .single();

          if (existing) {
            skipped++;
            continue;
          }

          // LINEからプロフィール取得を試みる
          let profile: { displayName: string; pictureUrl?: string; statusMessage?: string } | null = null;
          try {
            profile = await getUserProfile(lineUserId);
          } catch {
            // プロフィール取得失敗（ブロック済み等）
          }

          const tags = tagsRaw
            ? tagsRaw.split(/[、,;|]/).map((t) => t.trim()).filter(Boolean)
            : [];

          await supabase.from("friends").insert({
            line_user_id: lineUserId,
            display_name: profile?.displayName || displayName || "不明",
            picture_url: profile?.pictureUrl || null,
            status_message: profile?.statusMessage || null,
            tags,
            is_blocked: !profile, // プロフィール取得できない = ブロック済みの可能性
            joined_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          });
          imported++;
        }
        // LINE User IDがない場合は名前だけで登録
        else if (displayName) {
          await supabase.from("friends").insert({
            line_user_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            display_name: displayName,
            picture_url: null,
            status_message: null,
            tags: tagsRaw
              ? tagsRaw.split(/[、,;|]/).map((t) => t.trim()).filter(Boolean)
              : [],
            is_blocked: false,
            joined_at: new Date().toISOString(),
            last_active_at: new Date().toISOString(),
          });
          imported++;
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
      }
    }

    return NextResponse.json({
      total: rows.length,
      imported,
      skipped,
      failed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "インポートに失敗しました" },
      { status: 500 }
    );
  }
}
