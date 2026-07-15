import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import {
  ALLOWED_AVATAR_TYPES,
  AVATAR_DIR,
  MAX_AVATAR_BYTES,
  ensureAvatarDir,
} from "@/lib/avatars/storage";
import { avatarPublicUrl } from "@/lib/avatars/urls";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP, and GIF images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 });
  }

  const ext = path.extname(file.name) || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext.toLowerCase())
    ? ext.toLowerCase()
    : ".jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;

  await ensureAvatarDir();
  const buffer = Buffer.from(await file.arrayBuffer());
  const avatarPath = path.join("uploads", "avatars", filename).replace(/\\/g, "/");
  await writeFile(path.join(AVATAR_DIR, filename), buffer);

  return NextResponse.json({
    avatarPath,
    url: avatarPublicUrl(avatarPath),
    filename,
  });
}