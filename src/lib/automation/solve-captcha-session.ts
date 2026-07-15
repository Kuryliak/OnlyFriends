import type { Account, Proxy } from "@prisma/client";
import { launchBrowser, closeBrowser, saveCookies } from "./browser";
import { fingerprintForAccount } from "@/lib/proxy/fingerprint";
import { pickUserAgent } from "./human-behavior";
import { resolveCaptchaOrPause } from "./captcha";
import { womanProfileName } from "@/lib/names/women";
import {
  advanceToSignupStep2,
  ensureSignupStep1Visible,
  typeSignupField,
} from "./signup-form";

export type SolveCaptchaResult =
  | { solved: true; cookies: string }
  | { solved: false; error: string };

async function prepareRegisterCaptchaStep(
  page: import("playwright").Page,
  account: Account
): Promise<string | null> {
  await ensureSignupStep1Visible(page);

  const email = account.email?.trim();
  if (!email) return "Account has no email";

  const profileName = womanProfileName(account.displayName ?? "", account.username);
  await typeSignupField(page, "#signup-form_details_login", email);
  await typeSignupField(page, "#signup-form_details_profile_name", profileName);
  await typeSignupField(page, "#signup-form_details_password", account.password);

  const tosCheckbox = page.locator("#signup-form_details_tos_pp");
  if (!(await tosCheckbox.isChecked())) {
    await tosCheckbox.check();
  }

  return advanceToSignupStep2(page);
}

/** Opens a visible Chromium window so the user can solve captcha manually. */
export async function openCaptchaSolver(
  account: Account,
  proxy: Proxy | null,
  options?: { startUrl?: string; jobType?: string }
): Promise<SolveCaptchaResult> {
  const captchaAccount = { ...account, status: "CAPTCHA" as const };
  const session = await launchBrowser({
    proxy,
    userAgent: account.userAgent ?? pickUserAgent(),
    cookies: account.cookies,
    account: captchaAccount,
    fingerprint: fingerprintForAccount(account.id, proxy?.country),
  });
  const { page, context } = session;

  console.log(
    `[captcha] Opened visible browser for ${account.username} — solve captcha in the Chromium window`
  );

  try {
    if (options?.jobType === "REGISTER") {
      const prepError = await prepareRegisterCaptchaStep(page, account);
      if (prepError) return { solved: false, error: prepError };
    } else {
      const { gotoXvideos } = await import("./overlays");
      const defaultUrl =
        options?.jobType === "REGISTER"
          ? "https://www.xvideos.com/account/create"
          : "https://www.xvideos.com/account";
      await gotoXvideos(page, options?.startUrl ?? defaultUrl);
    }

    const outcome = await resolveCaptchaOrPause(page, captchaAccount);
    const cookies = await saveCookies(context);

    if (outcome === "ok") {
      return { solved: true, cookies };
    }

    return {
      solved: false,
      error: "Captcha not solved within 3 minutes — try again in the Chromium window",
    };
  } catch (err) {
    return {
      solved: false,
      error: err instanceof Error ? err.message : "Failed to open captcha browser",
    };
  } finally {
    await closeBrowser(session);
  }
}