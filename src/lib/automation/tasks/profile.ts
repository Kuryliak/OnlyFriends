import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay, humanTypeDelay } from "../human-behavior";
import { gotoXvideos } from "../overlays";
import { resolveAvatarPath } from "@/lib/avatars/storage";
import { setAccountSexOnPage } from "../account-sex";

const BASE_URL = "https://www.xvideos.com";

export type ProfileUpdate = {
  username?: string;
  displayName?: string;
  bio?: string;
  avatarPath?: string;
  sex?: string;
};

export type ProfileResult =
  | { success: true; cookies: string }
  | { success: false; error: string; captcha?: boolean };

async function typeIntoField(
  page: import("playwright").Page,
  selector: string,
  value: string
): Promise<void> {
  const field = page.locator(selector);
  await field.waitFor({ state: "visible", timeout: 15_000 });
  await field.click();
  await field.fill("");
  for (const char of value) {
    await page.keyboard.type(char, { delay: humanTypeDelay() });
  }
  await randomDelay();
}

async function submitInForm(
  page: import("playwright").Page,
  formSelector: string,
  buttonText: string
): Promise<void> {
  const btn = page.locator(`${formSelector} button[type="submit"]`).filter({ hasText: buttonText });
  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await randomDelay(2000, 4000);
}

async function ensureProfileConsent(page: import("playwright").Page): Promise<void> {
  const consent = page.locator("#edit-profile_consent_consent_sensitive_data");
  if (await consent.count()) {
    const visible = await consent.isVisible().catch(() => false);
    if (visible && !(await consent.isChecked())) {
      await consent.check();
      await randomDelay(300, 600);
    }
  }
}

async function uploadAvatar(
  page: import("playwright").Page,
  avatarPath: string
): Promise<void> {
  await gotoXvideos(page, `${BASE_URL}/account/main-picture`);
  await randomDelay(1500, 2500);

  const fileInput = page.locator("#main-picture-upload_image-source");
  await fileInput.waitFor({ state: "attached", timeout: 15_000 });
  await fileInput.setInputFiles(resolveAvatarPath(avatarPath));

  await page
    .locator("#main-picture-upload_image")
    .waitFor({ state: "attached", timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const input = document.getElementById("main-picture-upload_image") as HTMLInputElement | null;
      return Boolean(input?.value?.startsWith("data:image"));
    },
    { timeout: 20_000 }
  );
  await randomDelay(1000, 2000);

  await submitInForm(page, "#main-picture-upload", "Upload");

  await page
    .locator("text=Picture uploaded")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function updateDisplayName(
  page: import("playwright").Page,
  displayName: string
): Promise<void> {
  await gotoXvideos(page, `${BASE_URL}/account/edit`);
  await randomDelay(1500, 2500);
  await typeIntoField(page, "#edit-account_first_name", displayName);
  await submitInForm(page, "#edit-account", "Update my information");
}

async function updateBio(page: import("playwright").Page, bio: string): Promise<void> {
  await gotoXvideos(page, `${BASE_URL}/account/profile/edit`);
  await randomDelay(1500, 2500);
  await ensureProfileConsent(page);
  await typeIntoField(page, "#edit-profile_about_me", bio);
  await submitInForm(page, "#edit-profile", "Update my information");
}

export async function updateProfile(
  account: Account,
  proxy: Proxy | null,
  updates: ProfileUpdate
): Promise<ProfileResult> {
  const session = await openAccountSession({ ...account, proxy }, "UPDATE_PROFILE");
  const { page, context } = session;

  try {
    if (updates.avatarPath?.trim()) {
      await uploadAvatar(page, updates.avatarPath);
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return { success: false, error: "Captcha during avatar upload", captcha: true };
      }
    }

    if (updates.displayName?.trim()) {
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return { success: false, error: "Captcha detected", captcha: true };
      }
      await updateDisplayName(page, updates.displayName.trim());
    }

    if (updates.bio?.trim()) {
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return { success: false, error: "Captcha detected", captcha: true };
      }
      await updateBio(page, updates.bio.trim());
    }

    if (updates.sex?.trim()) {
      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return { success: false, error: "Captcha detected", captcha: true };
      }
      await setAccountSexOnPage(page, updates.sex.trim());
    }

    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha after save", captcha: true };
    }

    const cookies = await saveCookies(context);
    return { success: true, cookies };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Profile update failed",
    };
  } finally {
    await closeBrowser(session);
  }
}