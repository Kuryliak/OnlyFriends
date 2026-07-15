import type { Account, Proxy } from "@prisma/client";
import { closeBrowser, saveCookies } from "../browser";
import { openAccountSession } from "../session";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay, humanScroll, humanMouseMove } from "../human-behavior";
import { dismissXvideosOverlays, gotoXvideos } from "../overlays";

const BASE_URL = "https://www.xvideos.com";

export type WarmupResult =
  | { success: true; cookies: string; pagesVisited: number }
  | { success: false; error: string; captcha?: boolean };

const WARMUP_PATHS = [
  "/",
  "/best",
  "/new/1",
  "/tags",
];

export async function warmupScroll(
  account: Account,
  proxy: Proxy | null,
  durationMinutes = 5
): Promise<WarmupResult> {
  const session = await openAccountSession({ ...account, proxy }, "WARMUP_SCROLL");
  const { page, context } = session;
  const endTime = Date.now() + durationMinutes * 60 * 1000;
  let pagesVisited = 0;

  try {
    while (Date.now() < endTime) {
      const path = WARMUP_PATHS[Math.floor(Math.random() * WARMUP_PATHS.length)];
      await gotoXvideos(page, `${BASE_URL}${path}`);
      pagesVisited++;
      await randomDelay(2000, 5000);

      if ((await resolveCaptchaOrPause(page, account)) === "captcha") {
        return { success: false, error: "Captcha during warmup", captcha: true };
      }

      await humanMouseMove(page);
      await humanScroll(page, { minScrolls: 4, maxScrolls: 12 });

      const videoLink = page.locator("div.thumb-block a[href*='/video']").first();
      if ((await videoLink.count()) && Math.random() > 0.6) {
        await dismissXvideosOverlays(page);
        await videoLink.click({ timeout: 15_000 });
        await randomDelay(5000, 15000);
        await humanScroll(page, { minScrolls: 2, maxScrolls: 5 });
        await page.goBack({ waitUntil: "domcontentloaded" });
        await dismissXvideosOverlays(page);
        await randomDelay(2000, 4000);
      }

      await randomDelay(5000, 12000);
    }

    const cookies = await saveCookies(context);
    return { success: true, cookies, pagesVisited };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Warmup failed",
    };
  } finally {
    await closeBrowser(session);
  }
}