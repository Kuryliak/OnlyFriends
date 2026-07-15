import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { mergeAccountCookies } from "../cookies";
import { outreachActionDelay } from "../ban-security";
import { openAccountSession } from "../session";
import { ensureXvideosSession, repairAccountCookies } from "../session-auth";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay, humanScroll } from "../human-behavior";
import { gotoXvideos } from "../overlays";

const BASE_URL = "https://www.xvideos.com";

export type SubscribeResult = {
  subscribed: string[];
  skipped: string[];
  failed: { user: string; error: string }[];
  captcha?: boolean;
  cookies?: string;
};

function normalizeSlug(target: string): string {
  return target.trim().replace(/^@+/, "").split("/").pop() ?? "";
}

function extractSubscribeCsrf(html: string): string | null {
  const match = html.match(/"subscribers":\{"csrf":\{"subscribe":"([^"]+)"/);
  return match?.[1] ?? null;
}

async function isAlreadySubscribed(page: import("playwright").Page): Promise<boolean> {
  return page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    if (/"isSubscribed":true/.test(html) || /"subscribed":true/.test(html)) {
      return true;
    }
    const strip = [...document.querySelectorAll(".user-subscribe")].find(
      (el) => el.getBoundingClientRect().width > 0
    );
    if (!strip) return false;
    const labels = [...strip.querySelectorAll(".sub-state-text")].map((el) => ({
      text: el.textContent?.trim().toLowerCase() ?? "",
      visible: getComputedStyle(el as HTMLElement).display !== "none",
    }));
    return labels.some((l) => l.visible && l.text === "subscribed");
  });
}

async function subscribeToProfile(
  page: import("playwright").Page,
  target: string
): Promise<{ ok: true; already?: boolean } | { ok: false; error: string }> {
  const slug = normalizeSlug(target);
  if (!slug) return { ok: false, error: "Invalid profile username" };

  await gotoXvideos(page, `${BASE_URL}/profiles/${slug}`, 30_000);
  await randomDelay(2000, 3500);
  await humanScroll(page, { minScrolls: 1, maxScrolls: 2 });

  if (await isAlreadySubscribed(page)) {
    return { ok: true, already: true };
  }

  const html = await page.content();
  const csrf = extractSubscribeCsrf(html);
  if (!csrf) {
    return { ok: false, error: "Subscribe token not found on profile page" };
  }

  const response = await page.request.post(`${BASE_URL}/profiles/${slug}/followers/subscribe`, {
    form: { ref: "", csrf },
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${BASE_URL}/profiles/${slug}`,
    },
  });

  let body: { result?: boolean; code?: number; data?: Record<string, string> } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { ok: false, error: `Subscribe request failed (${response.status()})` };
  }

  if (body.result === true) {
    return { ok: true };
  }

  const verifyEmail = body.data?.action_need_verified_email;
  if (verifyEmail) {
    return {
      ok: false,
      error: `Email verification required (${verifyEmail})`,
    };
  }

  if (body.code) {
    return { ok: false, error: `Subscribe rejected (code ${body.code})` };
  }

  // Fallback: click visible Subscribe control
  const subscribeText = page
    .locator(".user-subscribe")
    .filter({ has: page.locator(".sub-state-text", { hasText: /^Subscribe$/ }) })
    .last()
    .locator(".sub-state-text", { hasText: /^Subscribe$/ });

  if (await subscribeText.count()) {
    await subscribeText.click({ force: true });
    await randomDelay(2000, 4000);
    if (await isAlreadySubscribed(page)) {
      return { ok: true };
    }
  }

  return { ok: false, error: "Subscribe did not complete" };
}

export async function subscribeToProfiles(
  account: Account,
  proxy: Proxy | null,
  targets: string[]
): Promise<SubscribeResult> {
  const repaired = await repairAccountCookies(account);
  const baseCookies = repaired ?? account.cookies;
  const session = await openAccountSession(
    { ...account, cookies: baseCookies, proxy },
    "SUBSCRIBE"
  );
  const { page, context } = session;
  const subscribed: string[] = [];
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
        return { subscribed, skipped, failed, captcha: true, cookies };
      }
      return {
        subscribed,
        skipped,
        failed: [{ user: "*", error: auth.error }],
        cookies,
      };
    }

    for (const target of targets) {
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        const cookies = mergeAccountCookies(baseCookies, await saveCookies(context));
        return { subscribed, skipped, failed, captcha: true, cookies };
      }

      const slug = normalizeSlug(target);
      try {
        const result = await subscribeToProfile(page, slug);
        if (result.ok) {
          if (result.already) skipped.push(slug);
          else subscribed.push(slug);
        } else {
          failed.push({ user: slug, error: result.error });
        }
      } catch (err) {
        failed.push({
          user: slug,
          error: err instanceof Error ? err.message : "Subscribe failed",
        });
      }

      await outreachActionDelay();
    }

    const cookies = mergeAccountCookies(baseCookies, await saveCookies(context));
    return { subscribed, skipped, failed, cookies };
  } catch (err) {
    return {
      subscribed,
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