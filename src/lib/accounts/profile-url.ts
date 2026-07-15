const XVIDEOS_BASE_URL = "https://www.xvideos.com";

export function profileUrlForAccount(account: {
  profileSlug?: string | null;
}): string | null {
  const slug = account.profileSlug?.trim();
  if (!slug) return null;
  return `${XVIDEOS_BASE_URL}/profiles/${encodeURIComponent(slug)}`;
}