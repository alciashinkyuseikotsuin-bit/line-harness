import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET_NAME = "media";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"];

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    // バケットが存在しなければ作成
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET_NAME)) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_VIDEO_SIZE,
        allowedMimeTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
      });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが送信されていません" }, { status: 400 });
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: "対応していないファイル形式です。JPEG/PNG/MP4のみ対応しています。" },
        { status: 400 }
      );
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: "画像は10MB以下にしてください" }, { status: 400 });
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: "動画は200MB以下にしてください" }, { status: 400 });
    }

    // ファイル名を生成（衝突を避ける）
    const ext = file.name.split(".").pop() || (isImage ? "jpg" : "mp4");
    const folder = isImage ? "images" : "videos";
    const fileName = `${folder}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;

    // Supabase Storageにアップロード
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      return NextResponse.json({ error: `アップロード失敗: ${error.message}` }, { status: 500 });
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);

    return NextResponse.json({
      url: urlData.publicUrl,
      type: isImage ? "image" : "video",
      fileName: file.name,
      size: file.size,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "アップロードに失敗しました" },
      { status: 500 }
    );
  }
}
