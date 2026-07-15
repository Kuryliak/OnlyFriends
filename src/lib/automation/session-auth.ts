import type { Account } from "@prisma/client";
import type { Page } from "playwright";
import { prisma } from "@/lib/db";
import { gotoXvideos } from "./overlays";
import { randomDelay } from "./human-behavior";
import {
  hasAuthenticatedCookies,
  mergeAccountCookies,
} from "./cookies";
import {
  detectCaptcha,
  resolveCaptchaOrPause,
  waitForFriendlyCaptcha,
} from "./captcha";

const ACCOUNT_URL = "https://www.xvideos.com/account";

export async function isXvideosSessionAuthenticated(page: Page): Promise<boolean> {
  const cookies = await page.context().cookies();
  return cookies.some((c) => c.name === "session_token_auth" && c.value?.trim());
}

export async function isXvideosLoggedIn(page: Page): Promise<boolean> {
  if (await isXvideosSessionAuthenticated(page)) return true;

  return page.evaluate(() => {
    const userId = (
      window as unknown as { xv?: { conf?: { data?: { user?: { id?: number } } } } }
    ).xv?.conf?.data?.user?.id;
    if (userId) return true;

    const signin = document.querySelector("#signin-form_login");
    if (signin) return false;

    return !/account login/i.test(document.title);
  });
}

async function extractSigninError(page: Page): Promise<string | null> {
  const alert = page.locator(".alert-danger, .form-error, .error-message").first();
  if (await alert.isVisible().catch(() => false)) {
    const text = (await alert.innerText()).trim();
    if (text) return text;
  }
  return null;
}

export type EnsureSessionResult =
  | { ok: true; relogged: boolean; cookies?: string }
  | { ok: false; error: string; captcha?: boolean; cookies?: string };

async function findLastAuthenticatedCookies(accountId: string): Promise<string | null> {
  const jobs = await prisma.job.findMany({
    where: {
      accountId,
      status: "COMPLETED",
      result: { contains: "session_token_auth" },
    },
    orderBy: { completedAt: "desc" },
    take: 8,
    select: { result: true },
  });

  for (const job of jobs) {
    if (!job.result) continue;
    try {
      const parsed = JSON.parse(job.result) as { cookies?: string };
      if (parsed.cookies && hasAuthenticatedCookies(parsed.cookies)) {
        return parsed.cookies;
      }
    } catch {
      // ignore malformed job payloads
    }
  }

  return null;
}

export async function repairAccountCookies(account: Account): Promise<string | null> {
  if (hasAuthenticatedCookies(account.cookies)) return null;

  const archived = await findLastAuthenticatedCookies(account.id);
  if (!archived) return null;

  return mergeAccountCookies(account.cookies, archived);
}

export async function ensureXvideosSession(
  page: Page,
  account: Account
): Promise<EnsureSessionResult> {
  if (await isXvideosSessionAuthenticated(page)) {
    return { ok: true, relogged: false };
  }

  const repaired = await repairAccountCookies(account);
  if (repaired) {
    const parsed = JSON.parse(repaired) as Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    }>;
    await page.context().addCookies(parsed);
    if (await isXvideosSessionAuthenticated(page)) {
      return { ok: true, relogged: true, cookies: repaired };
    }
  }

  await gotoXvideos(page, ACCOUNT_URL, 30_000);
  await randomDelay(1000, 2000);

  if (await isXvideosSessionAuthenticated(page) || (await isXvideosLoggedIn(page))) {
    return { ok: true, relogged: false };
  }

  const email = account.email?.trim();
  if (!email) {
    return { ok: false, error: "Account has no email — cannot restore XVIDEOS session" };
  }

  const loginField = page.locator("#signin-form_login");
  if (!(await loginField.isVisible().catch(() => false))) {
    await gotoXvideos(page, ACCOUNT_URL, 30_000);
    await randomDelay(1000, 2000);
  }

  if (await isXvideosLoggedIn(page)) {
    return { ok: true, relogged: false };
  }

  if (!(await loginField.isVisible().catch(() => false))) {
    return {
      ok: false,
      error:
        "Account session expired — open the account in Jobs, log in on XVIDEOS, then Resume",
    };
  }

  await loginField.click({ force: true });
  await loginField.fill(email);
  await page.locator("#signin-form_password").fill(account.password);

  const captchaWidget = page.locator("#signin-form .frc-captcha, #signin-popup-form .frc-captcha").first();
  if (await captchaWidget.count()) {
    const solved = await waitForFriendlyCaptcha(page, {
      scope: "#signin-form, #signin-popup-form",
      timeoutMs: 120_000,
    });
    if (!solved) {
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return {
          ok: false,
          error: "Login captcha required — open Jobs, solve in browser, then Resume",
          captcha: true,
          cookies: JSON.stringify(await page.context().cookies()),
        };
      }
    }
  }

  await page.locator('#signin-form button[type="submit"], #signin-form .btn-danger').first().click();

  try {
    await page.waitForFunction(
      () => {
        const userId = (
          window as unknown as { xv?: { conf?: { data?: { user?: { id?: number } } } } }
        ).xv?.conf?.data?.user?.id;
        if (userId) return true;
        return !document.querySelector("#signin-form_login");
      },
      { timeout: 20_000 }
    );
  } catch {
    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return {
        ok: false,
        error: "Login blocked by captcha — solve in browser window, then Resume",
        captcha: true,
        cookies: JSON.stringify(await page.context().cookies()),
      };
    }

    const signinError = await extractSigninError(page);
    if (signinError) {
      return { ok: false, error: `Login failed: ${signinError}` };
    }

    if (await detectCaptcha(page)) {
      return {
        ok: false,
        error: "Login captcha required — solve in browser window, then Resume",
        captcha: true,
        cookies: JSON.stringify(await page.context().cookies()),
      };
    }

    return { ok: false, error: "Login did not complete — check email and password" };
  }

  if (!(await isXvideosLoggedIn(page))) {
    return { ok: false, error: "Login submitted but session is still anonymous" };
  }

  return {
    ok: true,
    relogged: true,
    cookies: JSON.stringify(await page.context().cookies()),
  };
}