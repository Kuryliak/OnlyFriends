import type { Account } from "@prisma/client";
import type { Page } from "playwright";
import { useVisibleBrowser } from "./browser";

const LEGACY_CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  ".g-recaptcha",
  '#captcha',
  'img[src*="captcha"]',
  'input[name="captcha"]',
];

export async function isFriendlyCaptchaSolved(
  page: Page,
  scope = "#signup-form_step2"
): Promise<boolean> {
  const values = await page
    .locator(`${scope} input[name="frc-captcha-response"]`)
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));

  return values.some(
    (value) =>
      value &&
      !value.startsWith(".") &&
      value.length > 40
  );
}

export async function waitForFriendlyCaptcha(
  page: Page,
  options?: { scope?: string; timeoutMs?: number }
): Promise<boolean> {
  const scope = options?.scope ?? "#signup-form_step2";
  const timeoutMs = options?.timeoutMs ?? 90_000;

  const widget = page.locator(`${scope} .frc-captcha`).first();
  if (!(await widget.count())) return true;

  const box = await widget.boundingBox();
  if (box) {
    await page.mouse.click(box.x + 30, box.y + 35);
    await page.waitForTimeout(500);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isFriendlyCaptchaSolved(page, scope)) return true;
    await page.waitForTimeout(1000);
  }

  return isFriendlyCaptchaSolved(page, scope);
}

export async function detectCaptcha(page: Page): Promise<boolean> {
  if (await page.locator(".frc-captcha").count()) return true;

  for (const selector of LEGACY_CAPTCHA_SELECTORS) {
    if (await page.locator(selector).count()) return true;
  }

  const body = await page.locator("body").innerText();
  if (/must fill in the CAPTCHA/i.test(body)) return true;

  return false;
}

export type CaptchaResult =
  | { detected: false }
  | { detected: true; selector: string };

export async function waitForCaptchaCleared(
  page: Page,
  timeoutMs = 180_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await detectCaptcha(page))) return true;
    await page.waitForTimeout(1500);
  }
  return !(await detectCaptcha(page));
}

/** In visible mode, wait for manual solve; in headless mode, pause immediately. */
export async function resolveCaptchaOrPause(
  page: Page,
  account: Pick<Account, "status">
): Promise<"ok" | "captcha"> {
  if (!(await detectCaptcha(page))) return "ok";

  if (!useVisibleBrowser(account)) return "captcha";

  const friendlyScope = (await page.locator(".frc-captcha").count())
    ? "body"
    : "#signup-form_step2";
  if (await page.locator(`${friendlyScope} .frc-captcha`).count()) {
    const solved = await waitForFriendlyCaptcha(page, {
      scope: friendlyScope,
      timeoutMs: 180_000,
    });
    return solved ? "ok" : "captcha";
  }

  const cleared = await waitForCaptchaCleared(page, 180_000);
  return cleared ? "ok" : "captcha";
}

export async function detectCaptchaDetailed(page: Page): Promise<CaptchaResult> {
  for (const selector of LEGACY_CAPTCHA_SELECTORS) {
    const count = await page.locator(selector).count();
    if (count > 0) return { detected: true, selector };
  }

  const body = await page.locator("body").innerText();
  if (/must fill in the CAPTCHA/i.test(body)) {
    return { detected: true, selector: "captcha-error-message" };
  }

  return { detected: false };
}