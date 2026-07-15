import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { Account, Proxy } from "@prisma/client";
import type { BrowserFingerprint } from "@/lib/proxy/fingerprint";
import { stealthInitScript } from "@/lib/automation/stealth-browser";
import { isStealthEnabledSync } from "@/lib/settings/stealth";

export function useVisibleBrowser(account?: Pick<Account, "status"> | null): boolean {
  if (process.env.HEADLESS === "false") return true;
  return account?.status === "CAPTCHA";
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export type LaunchBrowserOptions = {
  proxy: Proxy | null;
  userAgent: string;
  cookies?: string | null;
  account?: Pick<Account, "status"> | null;
  fingerprint?: BrowserFingerprint;
};

function buildProxyConfig(proxy: Proxy | null) {
  if (!proxy) return undefined;
  return {
    server: `${proxy.type.toLowerCase()}://${proxy.host}:${proxy.port}`,
    username: proxy.username ?? undefined,
    password: proxy.password ?? undefined,
  };
}

export async function launchBrowser(options: LaunchBrowserOptions): Promise<BrowserSession> {
  const { proxy, userAgent, cookies, account, fingerprint } = options;
  const visible = useVisibleBrowser(account);
  if (visible) {
    console.log("[browser] Launching visible Chromium — solve captcha in this window");
  }

  const stealth = isStealthEnabledSync();
  const windowSize = fingerprint?.viewport ?? { width: 1366, height: 768 };

  const browser = await chromium.launch({
    headless: !visible,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      `--window-size=${windowSize.width},${windowSize.height}`,
      ...(stealth
        ? [
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-site-isolation-trials",
          ]
        : []),
    ],
  });

  const context = await browser.newContext({
    proxy: buildProxyConfig(proxy),
    userAgent,
    viewport: fingerprint?.viewport ?? { width: 1366, height: 768 },
    locale: fingerprint?.locale ?? "en-US",
    timezoneId: fingerprint?.timezoneId ?? "America/New_York",
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });

  const langs = fingerprint?.languages ?? ["en-US", "en"];
  if (stealth) {
    await context.addInitScript(stealthInitScript(langs));
  } else {
    await context.addInitScript((languages: string[]) => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => languages,
      });
      Object.defineProperty(navigator, "hardwareConcurrency", {
        get: () => 8,
      });
      // @ts-expect-error — chrome runtime stub
      window.chrome = { runtime: {} };
    }, langs);
  }

  if (cookies) {
    try {
      const parsed = JSON.parse(cookies);
      if (Array.isArray(parsed)) {
        await context.addCookies(parsed);
      }
    } catch {
      // ignore invalid cookies
    }
  }

  const page = await context.newPage();
  return { browser, context, page };
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close();
  await session.browser.close();
}

export async function saveCookies(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  return JSON.stringify(cookies);
}