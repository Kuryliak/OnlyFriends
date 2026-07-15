import type { Account, Proxy } from "@prisma/client";
import type { Page } from "playwright";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay } from "../human-behavior";
import { gotoXvideos } from "../overlays";

const BASE_URL = "https://www.xvideos.com";

const COMPOSER_SELECTORS = [
  "#chat-textarea-message",
  "#chat-send-btn",
  ".emojionearea-editor",
  "#chat-window .emojionearea-editor",
] as const;

export type SendMessageResult =
  | { success: true; cookies: string }
  | { success: false; error: string; captcha?: boolean };

function normalizeSlug(target: string): string {
  return target.trim().replace(/^@+/, "").split("/").pop()?.toLowerCase() ?? "";
}

async function isLoginPage(page: Page): Promise<boolean> {
  const url = page.url();
  if (/account-login|\/login/i.test(url)) return true;
  return page
    .locator('form[action*="account-login"], input[name="password"][type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
}

async function detectChatBlockReason(page: Page): Promise<string | null> {
  if (await isLoginPage(page)) {
    return "Account session expired — log in again on XVIDEOS";
  }

  const checks: Array<{ selector: string; message: string }> = [
    {
      selector: "#is-sheer-creator-chat-message",
      message: "This profile uses Sheer chat — standard messaging is not available",
    },
    {
      selector: "#chat-profile-send-request",
      message: "Not mutual friends yet — wait until they accept your friend request",
    },
    {
      selector: "#chat-home-tab-container-home-no-contacts",
      message: "No chat contacts available for this account",
    },
    {
      selector: "#chat_permission_not_ask",
      message: "Chat permission was denied for this profile",
    },
    {
      selector: "#chat_pass_no_key_form",
      message: "Chat encryption key must be set up on this account first",
    },
  ];

  for (const { selector, message } of checks) {
    const visible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) return message;
  }

  const hiddenWindow = await page
    .locator("#chat-window.chat-totaly-hidden, #chat-window.chat-hidden")
    .first()
    .isVisible()
    .catch(() => false);
  if (hiddenWindow) {
    return "Chat window is not open for this profile";
  }

  return null;
}

async function waitForChatShell(page: Page): Promise<void> {
  await page
    .locator("#account-chat-private-container, #chat-window, #chat-home")
    .first()
    .waitFor({ state: "attached", timeout: 20_000 })
    .catch(() => undefined);

  await page
    .locator("#account-chat-loading, #chat-preloader, #chat_loading_overlay")
    .first()
    .waitFor({ state: "hidden", timeout: 20_000 })
    .catch(() => undefined);

  await randomDelay(800, 1500);
}

async function grantChatPermission(page: Page): Promise<void> {
  const permission = page.locator("#chat_permission_ask").first();
  if (await permission.isVisible().catch(() => false)) {
    await permission.click({ force: true });
    await randomDelay(1200, 2200);
  }
}

async function waitForComposer(page: Page): Promise<boolean> {
  for (const selector of COMPOSER_SELECTORS) {
    try {
      await page.locator(selector).first().waitFor({ state: "visible", timeout: 12_000 });
      return true;
    } catch {
      // try next selector
    }
  }
  return false;
}

async function writeChatMessage(page: Page, message: string): Promise<boolean> {
  const textarea = page.locator("#chat-textarea-message").first();
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill(message);
    return true;
  }

  const editor = page.locator(".emojionearea-editor").first();
  if (await editor.isVisible().catch(() => false)) {
    await editor.click({ force: true });
    await editor.fill(message);
    await page.evaluate((text) => {
      const node = document.querySelector(".emojionearea-editor") as HTMLElement | null;
      if (!node) return;
      node.innerText = text;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("keyup", { bubbles: true }));
    }, message);
    return true;
  }

  return false;
}

async function clickSendMessage(page: Page): Promise<boolean> {
  const button = page.locator("#chat-send-btn").first();
  if (await button.isVisible().catch(() => false)) {
    await button.click({ force: true });
    return true;
  }

  return page.evaluate(() => {
    const send = document.querySelector("#chat-send-btn") as HTMLButtonElement | null;
    if (!send) return false;
    send.click();
    return true;
  });
}

export async function sendChatMessage(
  account: Account,
  proxy: Proxy | null,
  targetUser: string,
  message: string
): Promise<SendMessageResult> {
  const slug = normalizeSlug(targetUser);
  const text = message.trim();

  if (!slug) return { success: false, error: "Invalid profile username" };
  if (!text) return { success: false, error: "Message is empty" };

  const session = await openAccountSession({ ...account, proxy }, "SEND_MESSAGE");
  const { page, context } = session;

  try {
    await gotoXvideos(page, `${BASE_URL}/account/chat/${slug}`, 30_000);
    await randomDelay(2000, 3500);

    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha detected", captcha: true };
    }

    const earlyBlock = await detectChatBlockReason(page);
    if (earlyBlock) {
      return { success: false, error: earlyBlock };
    }

    await waitForChatShell(page);
    await grantChatPermission(page);

    const blockReason = await detectChatBlockReason(page);
    if (blockReason) {
      return { success: false, error: blockReason };
    }

    const hasComposer = await waitForComposer(page);
    if (!hasComposer) {
      const finalBlock = await detectChatBlockReason(page);
      return {
        success: false,
        error: finalBlock ?? "Chat composer not available for this profile",
      };
    }

    const wrote = await writeChatMessage(page, text);
    if (!wrote) {
      return { success: false, error: "Message input not found on chat page" };
    }

    await randomDelay(400, 900);

    const clicked = await clickSendMessage(page);
    if (!clicked) {
      return { success: false, error: "Send button not found" };
    }

    await randomDelay(2000, 3500);

    if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha after send", captcha: true };
    }

    const cookies = await saveCookies(context);
    return { success: true, cookies };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to send message",
    };
  } finally {
    await closeBrowser(session);
  }
}