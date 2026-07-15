import { chromium } from "playwright";
import type { Proxy } from "@prisma/client";

export type ProxyTestResult =
  | {
      ok: true;
      ip: string;
      elapsedMs: number;
      xvideosReachable: boolean;
      xvideosMs?: number;
      proxyType: string;
      endpoint: string;
    }
  | { ok: false; error: string; endpoint?: string };

function proxyEndpoint(proxy: Pick<Proxy, "host" | "port" | "type">): string {
  return `${proxy.type.toLowerCase()}://${proxy.host}:${proxy.port}`;
}

export async function testProxy(
  proxy: Pick<Proxy, "host" | "port" | "type" | "username" | "password">
): Promise<ProxyTestResult> {
  const start = Date.now();
  const endpoint = proxyEndpoint(proxy);

  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      proxy: {
        server: endpoint,
        username: proxy.username ?? undefined,
        password: proxy.password ?? undefined,
      },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await page.goto("https://api.ipify.org?format=json", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const body = await page.locator("body").innerText();
    const parsed = JSON.parse(body) as { ip?: string };
    if (!parsed.ip) {
      await browser.close();
      return { ok: false, error: "Could not read proxy egress IP", endpoint };
    }

    let xvideosReachable = false;
    let xvideosMs: number | undefined;
    const xvStart = Date.now();
    try {
      const response = await page.goto("https://www.xvideos.com/", {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      xvideosMs = Date.now() - xvStart;
      const title = await page.title();
      xvideosReachable =
        !!response &&
        response.status() < 500 &&
        !/account login/i.test(title) &&
        (await page.locator("body").innerText()).length > 200;
    } catch {
      xvideosMs = Date.now() - xvStart;
      xvideosReachable = false;
    }

    await browser.close();

    return {
      ok: true,
      ip: parsed.ip,
      elapsedMs: Date.now() - start,
      xvideosReachable,
      xvideosMs,
      proxyType: proxy.type,
      endpoint,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Proxy connection failed",
      endpoint,
    };
  }
}