import type { Page } from "playwright";
import { gotoXvideos } from "./overlays";
import { randomDelay, humanTypeDelay } from "./human-behavior";

const SIGNUP_URL = "https://www.xvideos.com/account/create";

const PAGE_CHROME = new Set([
  "Free signup",
  "Create a free account",
  "Create my free account",
  "Friendly Captcha",
  "Next",
  "OR",
  "XVIDEOS",
  "Language:",
  "Terms of service",
  "Privacy policy",
]);

export async function dismissSignupPopups(page: Page): Promise<void> {
  const popup = page.locator(".x-popup-content").first();
  if (await popup.isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

export async function ensureSignupStep1Visible(page: Page): Promise<void> {
  await gotoXvideos(page, SIGNUP_URL);
  await randomDelay(1500, 2500);

  const login = page.locator("#signup-form_details_login");
  if (await login.isVisible().catch(() => false)) return;

  const createAccountLink = page.locator('a:has-text("Create a free account")');
  if (await createAccountLink.count()) {
    await createAccountLink.first().click({ force: true });
    await randomDelay(1000, 2000);
  }

  if (!(await login.isVisible().catch(() => false))) {
    await page.evaluate(() => {
      document.querySelector("#signup-form_step1")?.classList.remove("hidden");
    });
  }

  await login.waitFor({ state: "visible", timeout: 15_000 });
}

export async function typeSignupField(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await dismissSignupPopups(page);
  const field = page.locator(selector);
  await field.click({ force: true });
  await field.fill("");
  for (const char of value) {
    await page.keyboard.type(char, { delay: humanTypeDelay() });
  }
  await randomDelay();
  await dismissSignupPopups(page);
}

export async function advanceToSignupStep2(page: Page): Promise<string | null> {
  await page.locator('a.btn-danger:has-text("Next")').click();

  try {
    await page.waitForFunction(
      () => {
        const step2 = document.querySelector("#signup-form_step2");
        return step2 instanceof HTMLElement && !step2.classList.contains("hidden");
      },
      { timeout: 15_000 }
    );
    await randomDelay(1500, 2500);
    return null;
  } catch {
    return (await extractSignupError(page)) ?? "Could not reach captcha step — check email and profile name";
  }
}

export async function extractSignupError(page: Page): Promise<string | null> {
  const popup = page.locator(".x-popup-content");
  if (await popup.isVisible().catch(() => false)) {
    const text = (await popup.first().innerText()).trim();
    if (text && !PAGE_CHROME.has(text)) return text;
  }

  const fieldErrors = await page
    .locator(
      "#signup-form .has-error .help-block, #signup-form .alert-danger, #signup-form .form-error"
    )
    .allTextContents();
  const joined = fieldErrors.map((t) => t.trim()).filter(Boolean).join("; ");
  if (joined) return joined;

  const body = await page.locator("body").innerText();
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 3 &&
        !PAGE_CHROME.has(l) &&
        !l.startsWith("OR ") &&
        !/^profile photo/i.test(l) &&
        !/images only/i.test(l)
    );

  const captchaLine = lines.find((l) => /must fill in the CAPTCHA/i.test(l));
  if (captchaLine) return captchaLine;

  const line = lines.find((l) =>
    /already|exist|invalid|error|captcha|taken|used|must|required|denied|sorry|unable|excluded/i.test(l)
  );
  if (line) return line;

  return null;
}