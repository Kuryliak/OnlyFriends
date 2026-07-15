import type { Page } from "playwright";

export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDelay(minMs = 800, maxMs = 2400): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, randomBetween(minMs, maxMs))
  );
}

export function humanTypeDelay(): number {
  return randomBetween(40, 120);
}

export async function humanScroll(
  page: Page,
  options?: { minScrolls?: number; maxScrolls?: number }
): Promise<void> {
  const minScrolls = options?.minScrolls ?? 3;
  const maxScrolls = options?.maxScrolls ?? 8;
  const scrollCount = randomBetween(minScrolls, maxScrolls);

  for (let i = 0; i < scrollCount; i++) {
    const distance = randomBetween(200, 600);
    await page.evaluate((d: number) => {
      window.scrollBy({ top: d, behavior: "smooth" });
    }, distance);
    await randomDelay(1200, 3500);
  }

  if (Math.random() > 0.5) {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    await randomDelay(800, 1500);
  }
}

export async function humanMouseMove(page: Page): Promise<void> {
  const moves = randomBetween(2, 5);
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(
      randomBetween(100, 900),
      randomBetween(100, 600)
    );
    await randomDelay(200, 600);
  }
}

export function pickUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ];
  return agents[randomBetween(0, agents.length - 1)];
}