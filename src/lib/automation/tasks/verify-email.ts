import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import { gotoXvideos, dismissXvideosOverlays } from "../overlays";
import { randomDelay } from "../human-behavior";
import {
  getMailToken,
  pollForXvideosVerificationLinks,
  scoreXvideosVerificationLink,
} from "@/lib/temp-mail/mailtm";

const EMAIL_PAGE = "https://www.xvideos.com/account/email";
const VALIDATE_PATH = "/account/email/validate";

export type VerifyEmailResult =
  | { success: true; cookies: string; alreadyVerified?: boolean }
  | { success: false; error: string; captcha?: boolean };

async function pageBodyText(page: import("playwright").Page): Promise<string> {
  return page.locator("body").innerText().catch(() => "");
}

/** True when XVIDEOS still says the email is not validated (strong signals only). */
async function isEmailUnverified(page: import("playwright").Page): Promise<boolean> {
  const text = await pageBodyText(page);
  return (
    /not been validated yet/i.test(text) ||
    /has not been validated/i.test(text) ||
    /email (address )?has not been validated/i.test(text) ||
    /your email (address )?is not verified/i.test(text)
  );
}

/** Positive signals that verification already succeeded. */
async function isEmailVerified(page: import("playwright").Page): Promise<boolean> {
  if (await isEmailUnverified(page)) return false;
  const text = await pageBodyText(page);
  // Avoid treating login / error pages as verified
  if (/log\s*in|sign\s*in|create my free account/i.test(text) && text.length < 1200) {
    if (!page.url().includes("/account/email")) return false;
  }
  // On /account/email: absence of the strong unverified banner means verified
  if (page.url().includes("/account/email")) {
    return true;
  }
  if (/has been validated|successfully verified|email (has been )?verified|validated successfully/i.test(text)) {
    return true;
  }
  return false;
}

async function verificationPageLooksSuccessful(page: import("playwright").Page): Promise<boolean> {
  const text = await pageBodyText(page);
  const url = page.url();
  if (/invalid|expired|already used|error|not found|cannot/i.test(text) && /valid|verif/i.test(url + text)) {
    // careful: don't hard-fail on generic "error" in chrome UI — only clear fails
    if (/invalid|expired|already used|link.*(invalid|expired)/i.test(text)) return false;
  }
  if (
    /thank you|has been validated|successfully verified|email (has been )?verified|validated successfully|confirmed/i.test(
      text
    )
  ) {
    return true;
  }
  // After token apply XVIDEOS often lands on account area without the unverified banner
  if (url.includes("/account") && !/not been validated yet/i.test(text)) {
    return true;
  }
  return false;
}

async function triggerVerificationEmail(page: import("playwright").Page): Promise<boolean> {
  const validateLink = page.locator(`a[href*="${VALIDATE_PATH}"]`).first();
  if (await validateLink.isVisible().catch(() => false)) {
    await validateLink.click();
    await randomDelay(2000, 3500);
  } else {
    await gotoXvideos(page, `https://www.xvideos.com${VALIDATE_PATH}`);
    await randomDelay(2000, 3500);
  }

  const body = await pageBodyText(page);
  return (
    /verification email has been sent/i.test(body) ||
    /email has been sent/i.test(body) ||
    /check your (e-?mail|inbox)/i.test(body) ||
    // Some locales / layouts just leave you on validate path after click
    page.url().includes(VALIDATE_PATH)
  );
}

async function openVerificationLink(
  page: import("playwright").Page,
  link: string
): Promise<void> {
  // Direct navigation preserves query token; wait for redirects to finish
  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await dismissXvideosOverlays(page);
  await randomDelay(1500, 2500);
  try {
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  } catch {
    /* ignore — XVIDEOS often keeps long-poll connections open */
  }
  await dismissXvideosOverlays(page);

  // Some templates show an intermediate "Confirm" / "Validate" button
  const confirmBtn = page
    .locator(
      'a[href*="valid"], button:has-text("Validate"), button:has-text("Confirm"), a:has-text("Validate"), a:has-text("Confirm my email"), a:has-text("Verify")'
    )
    .first();
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click().catch(() => undefined);
    await randomDelay(1500, 2500);
    await dismissXvideosOverlays(page);
  }
}

async function recheckEmailPage(page: import("playwright").Page): Promise<boolean> {
  await gotoXvideos(page, EMAIL_PAGE);
  await randomDelay(1500, 2500);
  // Hard reload once — XVIDEOS sometimes caches the unverified banner
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  await dismissXvideosOverlays(page);
  await randomDelay(1000, 1800);
  return isEmailVerified(page);
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

    if (await isEmailVerified(page)) {
      const cookies = await saveCookies(context);
      return { success: true, cookies, alreadyVerified: true };
    }

    // Only resend if still unverified — avoid flooding inbox with duplicate mails
    if (await isEmailUnverified(page)) {
      const sent = await triggerVerificationEmail(page);
      if (!sent) {
        // Continue anyway: a previous mail may already be in the inbox
        console.warn(
          `[verify-email] trigger may have failed for ${account.email}; polling inbox anyway`
        );
      }
    }

    const links = await pollForXvideosVerificationLinks(mailToken, {
      timeoutMs: 150_000,
      intervalMs: 4_000,
    });
    if (links.length === 0) {
      return {
        success: false,
        error: `Verification email not received at ${account.email} within ~2.5 minutes`,
      };
    }

    console.log(
      `[verify-email] ${account.email}: ${links.length} candidate link(s), best score=${scoreXvideosVerificationLink(links[0])}`
    );

    let lastSnippet = "";
    for (const link of links.slice(0, 5)) {
      const safeLog = link.replace(/([?&](token|key|hash|t|k)=)[^&]+/gi, "$1***");
      console.log(`[verify-email] trying ${safeLog}`);

      try {
        await openVerificationLink(page, link);
      } catch (err) {
        console.warn(
          `[verify-email] navigation failed:`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      lastSnippet = (await pageBodyText(page)).slice(0, 280).replace(/\s+/g, " ");

      // Fast path: page already looks good after token URL
      if (await verificationPageLooksSuccessful(page)) {
        if (await recheckEmailPage(page)) {
          const cookies = await saveCookies(context);
          return { success: true, cookies };
        }
      }

      if (await recheckEmailPage(page)) {
        const cookies = await saveCookies(context);
        return { success: true, cookies };
      }
    }

    // Final check
    if (await recheckEmailPage(page)) {
      const cookies = await saveCookies(context);
      return { success: true, cookies };
    }

    return {
      success: false,
      error: `Verification link opened but email is still unverified on XVIDEOS (tried ${Math.min(links.length, 5)} link(s)). Page: ${lastSnippet || "n/a"}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email verification failed",
    };
  } finally {
    await closeBrowser(session);
  }
}
