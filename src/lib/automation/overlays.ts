import type { Page } from "playwright";

async function hasBlockingOverlay(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const bg = document.getElementById("disclaimer_background");
    if (bg) {
      const style = getComputedStyle(bg);
      if (style.display !== "none" && style.visibility !== "hidden") return true;
    }

    const modal = document.querySelector('[class*="_modal-outer"]');
    if (modal && modal.className.includes("_open")) return true;

    return false;
  });
}

async function tryOverlayClick(
  page: Page,
  locator: ReturnType<Page["locator"]>
): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;
  try {
    await locator.click({ force: true, timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function forceDismissOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.classList.remove("disclaimer-opened");
    const bg = document.getElementById("disclaimer_background");
    if (bg) {
      bg.style.display = "none";
      bg.style.visibility = "hidden";
    }
    const modal = document.querySelector('[class*="_modal-outer"]') as HTMLElement | null;
    if (modal) modal.style.display = "none";
  });
}

export async function dismissXvideosOverlays(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!(await hasBlockingOverlay(page))) return;

    const acceptCookies = page
      .locator('#disclaimer-accept_cookies-btn, button:has-text("Accept all cookies")')
      .first();
    if (await tryOverlayClick(page, acceptCookies)) {
      await page.waitForTimeout(800);
      continue;
    }

    const newEnter = page.locator("button.main-cat-confirm").first();
    if (await newEnter.isVisible().catch(() => false)) {
      const straight = page.locator('button.main-cat[aria-label="Straight"]').first();
      await tryOverlayClick(page, straight);
      if (await tryOverlayClick(page, newEnter)) {
        await page.waitForTimeout(800);
        continue;
      }
    }

    const enterBtn = page.locator("button.disclaimer-enter-btn").first();
    if (await enterBtn.isVisible().catch(() => false)) {
      const straight = page.locator(".disclaimer-enter-straight").first();
      await tryOverlayClick(page, straight);
      if (await tryOverlayClick(page, enterBtn)) {
        await page.waitForTimeout(800);
        continue;
      }
      await forceDismissOverlays(page);
      return;
    }

    await forceDismissOverlays(page);
    return;
  }

  await forceDismissOverlays(page);
}

export async function gotoXvideos(
  page: Page,
  url: string,
  timeout = 60_000
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await dismissXvideosOverlays(page);
}