import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import { gotoXvideos } from "../overlays";
import { randomDelay } from "../human-behavior";
import {
  getMailToken,
  pollForXvideosVerificationLink,
} from "@/lib/temp-mail/mailtm";

const EMAIL_PAGE = "https://www.xvideos.com/account/email";
const VALIDATE_PATH = "/account/email/validate";

export type VerifyEmailResult =
  | { success: true; cookies: string; alreadyVerified?: boolean }
  | { success: false; error: string; captcha?: boolean };

async function isEmailUnverified(page: import("playwright").Page): Promise<boolean> {
  const text = await page.locator("body").innerText();
  return /not been validated yet/i.test(text);
}

async function triggerVerificationEmail(page: import("playwright").Page): Promise<boolean> {
  const validateLink = page.locator(`a[href="${VALIDATE_PATH}"]`).first();
  if (await validateLink.isVisible().catch(() => false)) {
    await validateLink.click();
    await randomDelay(2000, 3500);
  } else {
    await gotoXvideos(page, `https://www.xvideos.com${VALIDATE_PATH}`);
    await randomDelay(2000, 3500);
  }

  const body = await page.locator("body").innerText();
  return /verification email has been sent/i.test(body);
}

export async function verifyAccountEmail(
  account: Account,
  proxy: Proxy | null
): Promise<VerifyEmailResult> {
  if (!account.email?.trim()) {
    return { success: false, error: "Account has no email address" };
  }
  if (!account.emailPassword?.trim()) {
    return {
      success: false,
      error: "Account has no temp-mail credentials — create a new account with auto temp email",
    };
  }

  let mailToken: string;
  try {
    mailToken = await getMailToken(account.email, account.emailPassword);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to authenticate temp-mail inbox",
    };
  }

  const session = await openAccountSession({ ...account, proxy }, "VERIFY_EMAIL");
  const { page, context } = session;

  try {
    await gotoXvideos(page, EMAIL_PAGE);
    await randomDelay(1200, 2000);

    if (!(await isEmailUnverified(page))) {
      const cookies = await saveCookies(context);
      return { success: true, cookies, alreadyVerified: true };
    }

    const sent = await triggerVerificationEmail(page);
    if (!sent) {
      return { success: false, error: "Could not trigger XVIDEOS verification email" };
    }

    const verificationLink = await pollForXvideosVerificationLink(mailToken, {
      timeoutMs: 120_000,
      intervalMs: 5_000,
    });
    if (!verificationLink) {
      return {
        success: false,
        error: `Verification email not received at ${account.email} within 2 minutes`,
      };
    }

    await gotoXvideos(page, verificationLink);
    await randomDelay(2000, 3500);

    await gotoXvideos(page, EMAIL_PAGE);
    await randomDelay(1200, 2000);

    if (await isEmailUnverified(page)) {
      return {
        success: false,
        error: "Verification link opened but email is still unverified on XVIDEOS",
      };
    }

    const cookies = await saveCookies(context);
    return { success: true, cookies };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email verification failed",
    };
  } finally {
    await closeBrowser(session);
  }
}