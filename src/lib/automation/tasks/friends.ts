import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { outreachActionDelay } from "../ban-security";
import { openAccountSession } from "../session";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay, humanScroll } from "../human-behavior";
import { gotoXvideos } from "../overlays";
import { mergeAccountCookies } from "../cookies";
import { ensureXvideosSession, repairAccountCookies } from "../session-auth";
import {
  clickAddFriendControl,
  formatXvideosRejectError,
  isAccountLimitFriendError,
  waitForProfileFriendState,
  type XvideosApiBody,
} from "../xvideos-profile-api";

const BASE_URL = "https://www.xvideos.com";

export type AddFriendsResult = {
  added: string[];
  skipped: string[];
  failed: { user: string; error: string }[];
  captcha?: boolean;
  cookies?: string;
};

function normalizeSlug(target: string): string {
  return target.trim().replace(/^@+/, "").split("/").pop() ?? "";
}

async function postFriendRequest(
  page: import("playwright").Page,
  slug: string,
  csrf: string
): Promise<
  | { ok: true }
  | { ok: false; error: string; retryable?: boolean; accountLimit?: boolean }
> {
  const response = await page.request.post(
    `${BASE_URL}/profiles/${slug}/friends/requests/ask`,
    {
      form: { ref: "", csrf },
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/profiles/${slug}`,
      },
    }
  );

  let body: XvideosApiBody = {};
  try {
    body = (await response.json()) as XvideosApiBody;
  } catch {
    return { ok: false, error: `Friend request failed (${response.status()})`, retryable: true };
  }

  if (body.result === true) {
    return { ok: true };
  }

  const error = formatXvideosRejectError("friend", body);
  const accountLimit = isAccountLimitFriendError(error);
  return {
    ok: false,
    error,
    retryable: body.code === 11,
    accountLimit,
  };
}

async function tryUiFriendRequest(
  page: import("playwright").Page,
  slug: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clicked = await clickAddFriendControl(page);
  if (!clicked) {
    return { ok: false, error: "Add friend control not found on profile page" };
  }

  await randomDelay(2000, 4000);
  const state = await waitForProfileFriendState(page);
  if (state?.isFriend || state?.askedByVisitor) {
    return { ok: true };
  }

  return { ok: false, error: "Friend request UI click did not complete" };
}

async function addFriendToProfile(
  page: import("playwright").Page,
  target: string
): Promise<
  | { ok: true; already?: boolean }
  | { ok: false; error: string; accountLimit?: boolean }
> {
  const slug = normalizeSlug(target);
  if (!slug) return { ok: false, error: "Invalid profile username" };

  const loadProfile = async () => {
    await gotoXvideos(page, `${BASE_URL}/profiles/${slug}`, 30_000);
    await randomDelay(2000, 3500);
    await humanScroll(page, { minScrolls: 1, maxScrolls: 2 });
    return waitForProfileFriendState(page);
  };

  let state = await loadProfile();
  if (!state) {
    return { ok: false, error: "Friend request state not found on profile page" };
  }

  if (state.isFriend || state.askedByVisitor) {
    return { ok: true, already: true };
  }

  if (!state.visitorCanAsk) {
    return { ok: false, error: "Cannot send friend request to this profile" };
  }

  if (!state.csrfToken) {
    const uiResult = await tryUiFriendRequest(page, slug);
    if (uiResult.ok) return { ok: true };
    return {
      ok: false,
      error:
        "Friend request token not found — account session may be expired; open Jobs and log in again",
    };
  }

  let apiResult = await postFriendRequest(page, slug, state.csrfToken);

  if (!apiResult.ok && apiResult.retryable) {
    const previousCsrf = state.csrfToken;
    state = await loadProfile();
    if (state?.csrfToken) {
      apiResult = await postFriendRequest(page, slug, state.csrfToken);
    } else if (previousCsrf) {
      apiResult = await postFriendRequest(page, slug, previousCsrf);
    }
  }

  if (apiResult.ok) {
    return { ok: true };
  }

  if (!apiResult.ok && apiResult.retryable) {
    const uiResult = await tryUiFriendRequest(page, slug);
    if (uiResult.ok) return { ok: true };
  }

  return {
    ok: false,
    error: apiResult.ok ? "Friend request did not complete" : apiResult.error,
    accountLimit: !apiResult.ok ? apiResult.accountLimit : undefined,
  };
}

export async function addFriends(
  account: Account,
  proxy: Proxy | null,
  targetUsers: string[]
): Promise<AddFriendsResult> {
  const repaired = await repairAccountCookies(account);
  const baseCookies = repaired ?? account.cookies;
  const session = await openAccountSession(
    { ...account, cookies: baseCookies, proxy },
    "ADD_FRIENDS"
  );
  const { page, context } = session;
  const added: string[] = [];
  const skipped: string[] = [];
  const failed: { user: string; error: string }[] = [];

  try {
    const auth = await ensureXvideosSession(page, account);
    if (!auth.ok) {
      const cookies = mergeAccountCookies(
        baseCookies,
        auth.cookies ?? (await saveCookies(context))
      );
      if (auth.captcha) {
        return { added, skipped, failed, captcha: true, cookies };
      }
      return {
        added,
        skipped,
        failed: [{ user: "*", error: auth.error }],
        cookies,
      };
    }

    for (let index = 0; index < targetUsers.length; index++) {
      const targetUser = targetUsers[index];
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        const cookies = await saveCookies(context);
        return { added, skipped, failed, captcha: true, cookies };
      }

      const slug = normalizeSlug(targetUser);
      try {
        const result = await addFriendToProfile(page, slug);
        if (result.ok) {
          if (result.already) skipped.push(slug);
          else added.push(slug);
        } else {
          failed.push({ user: slug, error: result.error });
          if (result.accountLimit) {
            for (const remaining of targetUsers.slice(index + 1)) {
              const remainingSlug = normalizeSlug(remaining);
              failed.push({
                user: remainingSlug,
                error: "Skipped — account friend-request limit reached (code 11)",
              });
            }
            break;
          }
        }
      } catch (err) {
        failed.push({
          user: slug,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      await outreachActionDelay();
    }

    const cookies = mergeAccountCookies(baseCookies, await saveCookies(context));
    return { added, skipped, failed, cookies };
  } catch (err) {
    return {
      added,
      skipped,
      failed: [
        ...failed,
        { user: "*", error: err instanceof Error ? err.message : "Session failed" },
      ],
    };
  } finally {
    await closeBrowser(session);
  }
}