import fs from "fs/promises";
import path from "path";

export const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");
export const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function ensureAvatarDir(): Promise<void> {
  await fs.mkdir(AVATAR_DIR, { recursive: true });
}

export function resolveAvatarPath(avatarPath: string): string {
  const normalized = avatarPath.replace(/\\/g, "/");
  if (path.isAbsolute(normalized)) return normalized;

  const absolute = path.join(process.cwd(), normalized);
  const uploadsRoot = path.join(process.cwd(), "uploads");
  if (!absolute.startsWith(uploadsRoot)) {
    throw new Error("Invalid avatar path");
  }
  return absolute;
}

