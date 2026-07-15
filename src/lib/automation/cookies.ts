type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

const AUTH_COOKIE_NAMES = ["session_token_auth", "session_token"] as const;

function parseCookieArray(raw: string | null | undefined): StoredCookie[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredCookie[]) : [];
  } catch {
    return [];
  }
}

export function hasAuthenticatedCookies(cookiesJson: string | null | undefined): boolean {
  const cookies = parseCookieArray(cookiesJson);
  return cookies.some((c) => c.name === "session_token_auth" && c.value?.trim());
}

/** Keep auth cookies when a headless pass saves an anonymous session. */
export function mergeAccountCookies(
  previous: string | null | undefined,
  fresh: string
): string {
  const prev = parseCookieArray(previous);
  const next = parseCookieArray(fresh);

  if (!next.length) return previous?.trim() || fresh;

  const nextHasAuth = hasAuthenticatedCookies(JSON.stringify(next));
  if (nextHasAuth) return JSON.stringify(next);

  const preserved = prev.filter(
    (c) =>
      AUTH_COOKIE_NAMES.includes(c.name as (typeof AUTH_COOKIE_NAMES)[number]) &&
      c.value?.trim()
  );

  if (!preserved.length) return JSON.stringify(next);

  const withoutAuth = next.filter(
    (c) => !AUTH_COOKIE_NAMES.includes(c.name as (typeof AUTH_COOKIE_NAMES)[number])
  );

  return JSON.stringify([...withoutAuth, ...preserved]);
}