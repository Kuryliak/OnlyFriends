const BASE_URL = "https://www.xvideos.com";
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type XvideosFriendStats = {
  mutualFriends: string[];
  friendRequestsSent: string[];
  mutualFriendsCount: number;
  friendRequestsSentCount: number;
};

type StoredCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

function cookieHeaderFromJson(cookiesJson: string): string {
  const cookies = JSON.parse(cookiesJson) as StoredCookie[];
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

function extractProfileSlugs(html: string): string[] {
  const slugs = [...html.matchAll(/href="\/profiles\/([a-zA-Z0-9_]+)"/g)].map((m) => m[1]);
  return [...new Set(slugs)];
}

function extractNbFriends(html: string): number | null {
  const match = html.match(/"nb_friends":(\d+)/);
  return match ? Number(match[1]) : null;
}

async function fetchPage(path: string, cookiesJson: string, userAgent?: string | null): Promise<string> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Cookie: cookieHeaderFromJson(cookiesJson),
      "User-Agent": userAgent?.trim() || DEFAULT_UA,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`XVIDEOS friend stats failed (${response.status})`);
  }

  return response.text();
}

export async function fetchXvideosFriendStats(
  cookiesJson: string,
  userAgent?: string | null
): Promise<XvideosFriendStats> {
  const [accountHtml, friendsHtml, sentHtml] = await Promise.all([
    fetchPage("/account", cookiesJson, userAgent),
    fetchPage("/account/friends", cookiesJson, userAgent),
    fetchPage("/account/friends/requests/sent", cookiesJson, userAgent),
  ]);

  const mutualFriends = extractProfileSlugs(friendsHtml);
  const friendRequestsSent = extractProfileSlugs(sentHtml);
  const nbFriends = extractNbFriends(accountHtml) ?? extractNbFriends(friendsHtml);

  return {
    mutualFriends,
    friendRequestsSent,
    mutualFriendsCount: nbFriends ?? mutualFriends.length,
    friendRequestsSentCount: friendRequestsSent.length,
  };
}

export function parseFriendSlugList(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}