export function avatarPublicUrl(avatarPath: string): string {
  const filename = avatarPath.replace(/\\/g, "/").split("/").pop() ?? "";
  return `/api/uploads/avatar/${filename}`;
}