import type { Page } from "playwright";
import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "./browser";
import { openAccountSession } from "./session";
import { resolveCaptchaOrPause } from "./captcha";
import { randomDelay } from "./human-behavior";
import { gotoXvideos } from "./overlays";

const BASE_URL = "https://www.xvideos.com";

export const ACCOUNT_SEX_WOMAN = "Woman";

export type AccountSexResult =
  | { success: true; cookies: string; changed: boolean }
  | { success: false; error: string; captcha?: boolean };

async function submitAccountEdit(page: Page): Promise<void> {
  const btn = page
    .locator('#edit-account button[type="submit"]')
    .filter({ hasText: "Update my information" });
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await randomDelay(2000, 4000);
}

/** Sets account sex on an open browser page. Returns true when the value was changed. */
export async function setAccountSexOnPage(
  page: Page,
  sex: string = ACCOUNT_SEX_WOMAN
): Promise<boolean> {
  await gotoXvideos(page, `${BASE_URL}/account/edit`);
  await randomDelay(1500, 2500);

  const select = page.locator("#edit-account_sex");
  await select.waitFor({ state: "visible", timeout: 15_000 });

  const current = await select.inputValue();
  if (current === sex) return false;

  await select.selectOption(sex);
  await submitAccountEdit(page);
  return true;
}

export async function ensureAccountSex(
  account: Account,
  proxy: Proxy | null,
  sex: string = ACCOUNT_SEX_WOMAN
): Promise<AccountSexResult> {
  const session = await openAccountSession({ ...account, proxy });
  const { page, context } = session;

  try {
    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha detected", captcha: true };
    }

    const changed = await setAccountSexOnPage(page, sex);

    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha after sex update", captcha: true };
    }

    const cookies = await saveCookies(context);
    return { success: true, cookies, changed };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update account sex",
    };
  } finally {
    await closeBrowser(session);
  }
}