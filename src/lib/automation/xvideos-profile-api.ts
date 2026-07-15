import type { Page } from "playwright";

export type XvideosApiBody = {
  result?: boolean;
  code?: number;
  data?: Record<string, string>;
};

export type ProfileFriendState = {
  isFriend: boolean;
  askedByVisitor: boolean;
  visitorCanAsk: boolean;
  csrfToken: string | null;
};

const FRIEND_CODE_MESSAGES: Record<number, string> = {
  4: "Profile does not accept friend requests from your account",
  11: "Account friend-request limit reached or request blocked by XVIDEOS",
};

export function formatXvideosRejectError(
  action: "friend" | "subscribe",
  body: XvideosApiBody
): string {
  const verifyEmail = body.data?.action_need_verified_email;
  if (verifyEmail) {
    return `Email verification required (${verifyEmail})`;
  }

  const dataHint = body.data
    ? Object.entries(body.data)
        .filter(([, value]) => value?.trim())
        .map(([key, value]) => `${key}: ${value}`)
        .join("; ")
    : "";

  if (body.code) {
    const known =
      action === "friend"
        ? FRIEND_CODE_MESSAGES[body.code]
        : undefined;
    const label = action === "friend" ? "Friend request" : "Subscribe";
    if (known && dataHint) return `${known} (code ${body.code}; ${dataHint})`;
    if (known) return `${known} (code ${body.code})`;
    if (dataHint) return `${label} rejected (code ${body.code}; ${dataHint})`;
    return `${label} rejected (code ${body.code})`;
  }

  if (dataHint) {
    return `${action === "friend" ? "Friend request" : "Subscribe"} rejected (${dataHint})`;
  }

  return action === "friend" ? "Friend request did not complete" : "Subscribe did not complete";
}

export function isAccountLimitFriendError(error: string): boolean {
  return /code 11\b/i.test(error) || /friend-request limit/i.test(error);
}

function parseCsrfToken(csrf: unknown): string | null {
  if (typeof csrf === "string" && csrf.trim()) return csrf.trim();
  if (Array.isArray(csrf)) {
    const first = csrf.find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first.trim() : null;
  }
  if (csrf && typeof csrf === "object") {
    const record = csrf as Record<string, unknown>;
    for (const key of ["addFriendRequest", "ask", "csrf", "token"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function extractFriendsBlock(html: string): string | null {
  const anchor = '"friends":{';
  const start = html.indexOf(anchor);
  if (start < 0) return null;

  let depth = 0;
  const open = start + anchor.length - 1;
  for (let i = open; i < Math.min(html.length, open + 2500); i++) {
    if (html[i] === "{") depth += 1;
    else if (html[i] === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extractFriendCsrfFromHtml(html: string): string | null {
  const block = extractFriendsBlock(html);
  if (!block) return null;

  const patterns = [
    /"csrf":\{"addFriendRequest":"([^"]+)"/,
    /"addFriendRequest":"([^"]+)"/,
    /"csrf":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export async function readProfileFriendState(page: Page): Promise<ProfileFriendState | null> {
  const fromConf = await page.evaluate(() => {
    const friends = (
      window as unknown as {
        xv?: { conf?: { data?: { friends?: Record<string, unknown> } } };
      }
    ).xv?.conf?.data?.friends;

    if (!friends || typeof friends !== "object") return null;

    return {
      isFriend: !!friends.isFriend,
      askedByVisitor: !!friends.askedByVisitor,
      visitorCanAsk: friends.visitorCanAsk !== false,
      csrf: friends.csrf,
    };
  });

  if (fromConf) {
    return {
      isFriend: fromConf.isFriend,
      askedByVisitor: fromConf.askedByVisitor,
      visitorCanAsk: fromConf.visitorCanAsk,
      csrfToken: parseCsrfToken(fromConf.csrf),
    };
  }

  const html = await page.content();
  const block = extractFriendsBlock(html);
  if (!block) return null;

  return {
    isFriend: /"isFriend":true/.test(block),
    askedByVisitor: /"askedByVisitor":true/.test(block),
    visitorCanAsk: !/"visitorCanAsk":false/.test(block),
    csrfToken: extractFriendCsrfFromHtml(html),
  };
}

export async function waitForProfileFriendState(
  page: Page,
  timeoutMs = 12_000
): Promise<ProfileFriendState | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await readProfileFriendState(page);
    if (!state) {
      await page.waitForTimeout(400);
      continue;
    }
    if (state.csrfToken || state.isFriend || state.askedByVisitor || !state.visitorCanAsk) {
      return state;
    }
    await page.waitForTimeout(400);
  }

  return readProfileFriendState(page);
}

export async function clickAddFriendControl(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole("button", { name: /add friend/i }),
    page.getByRole("link", { name: /add friend/i }),
    page.locator('[data-action="add_friend_request"]'),
    page.locator(".btn-friend, .btn-friend-request, .friend-request"),
  ];

  for (const locator of candidates) {
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const target = locator.nth(i);
      if (!(await target.isVisible().catch(() => false))) continue;
      await target.click({ force: true });
      return true;
    }
  }

  return false;
}