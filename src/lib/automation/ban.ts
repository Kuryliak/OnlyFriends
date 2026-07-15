import type { Page } from "playwright";

const BAN_PATTERNS = [
  /account (?:has been |is )?banned/i,
  /your account (?:was |has been )?suspended/i,
  /account (?:has been |is )?disabled/i,
  /access (?:to your account )?has been (?:revoked|blocked)/i,
  /violat(?:ed|ion).*terms/i,
  /account (?:has been |is )?terminated/i,
];

export function isBanMessage(text: string): boolean {
  return BAN_PATTERNS.some((pattern) => pattern.test(text));
}

export async function detectBan(page: Page): Promise<boolean> {
  const body = await page.locator("body").innerText();
  return isBanMessage(body);
}

export function banReasonFromText(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 5 && isBanMessage(l));
  return line ?? (isBanMessage(text) ? "Account appears banned on XVIDEOS" : null);
}