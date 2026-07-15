import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import {
  detectCaptcha,
  isFriendlyCaptchaSolved,
  resolveCaptchaOrPause,
  waitForFriendlyCaptcha,
} from "../captcha";
import { setAccountSexOnPage } from "../account-sex";
import { womanProfileName } from "@/lib/names/women";
import {
  advanceToSignupStep2,
  ensureSignupStep1Visible,
  extractSignupError,
  typeSignupField,
} from "../signup-form";

export type RegisterResult =
  | { success: true; cookies: string }
  | { success: false; error: string; captcha?: boolean };

async function waitForRegistration(page: import("playwright").Page): Promise<boolean> {
  try {
    await page.waitForURL(
      (url) => url.pathname.includes("/account") && !url.pathname.includes("/account/create"),
      { timeout: 20_000 }
    );
    return true;
  } catch {
    const current = page.url();
    return current.includes("/account") && !current.includes("/account/create");
  }
}

export async function registerAccount(
  account: Account,
  proxy: Proxy | null
): Promise<RegisterResult> {
  const session = await openAccountSession({ ...account, proxy }, "REGISTER");
  const { page, context } = session;

  try {
    await ensureSignupStep1Visible(page);

    const email = account.email?.trim();
    if (!email) {
      return { success: false, error: "Account has no email — temp-mail inbox was not provisioned" };
    }
    // Feminine display name + numeric suffix keeps the profile readable and unique on XVIDEOS.
    const profileName = womanProfileName(
      account.displayName ?? "",
      account.username
    );

    await typeSignupField(page, "#signup-form_details_login", email);
    await typeSignupField(page, "#signup-form_details_profile_name", profileName);
    await typeSignupField(page, "#signup-form_details_password", account.password);

    const tosCheckbox = page.locator("#signup-form_details_tos_pp");
    if (!(await tosCheckbox.isChecked())) {
      await tosCheckbox.check();
    }

    const step2Error = await advanceToSignupStep2(page);
    if (step2Error) {
      return { success: false, error: step2Error };
    }

    const captchaReady = await waitForFriendlyCaptcha(page, { timeoutMs: 180_000 });
    if (!captchaReady) {
      return {
        success: false,
        error: "FriendlyCaptcha not solved — Jobs → Open browser, solve captcha, then Resume",
        captcha: true,
      };
    }

    if (!(await isFriendlyCaptchaSolved(page))) {
      return {
        success: false,
        error: "Captcha expired before submit — Jobs → Open browser, solve captcha, then Resume",
        captcha: true,
      };
    }

    await page.locator('button:has-text("Create my free account")').click();
    const registered = await waitForRegistration(page);

    if (!registered && (await resolveCaptchaOrPause(page, account)) === "captcha") {
      return {
        success: false,
        error: "Captcha blocked registration — solve it in the browser window, then Resume",
        captcha: true,
      };
    }

    if (!registered) {
      const signupError = await extractSignupError(page);
      const captchaBlocked =
        !(await isFriendlyCaptchaSolved(page)) ||
        (await detectCaptcha(page)) ||
        /must fill in the CAPTCHA/i.test(signupError ?? "");

      if (captchaBlocked) {
        return {
          success: false,
          error: "Captcha not solved — Jobs → Open browser, solve captcha, then Resume",
          captcha: true,
        };
      }

      return {
        success: false,
        error:
          signupError ??
          "Registration did not complete — email or profile name may already be taken",
      };
    }

    await setAccountSexOnPage(page);

    const cookies = await saveCookies(context);
    return { success: true, cookies };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Registration failed",
    };
  } finally {
    await closeBrowser(session);
  }
}