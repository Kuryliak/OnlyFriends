import type { Account, Proxy } from "@prisma/client";
import type { Page } from "playwright";
import { closeBrowser } from "./browser";
import { openAccountSession } from "./session";
import { gotoXvideos } from "./overlays";

const BASE_URL = "https://www.xvideos.com";

function slugCandidates(account: Pick<Account, "username" | "displayName">): string[] {
  const out: string[] = [];
  const push = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    out.push(trimmed);
    out.push(trimmed.toLowerCase());
    const dashed = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (dashed) out.push(dashed);
  };

  push(account.username);
  push(account.displayName);

  return [...new Set(out)];
}

async function isOwnPublicProfile(page: Page): Promise<boolean> {
  const body = await page.locator("body").innerText();
  if (/sorry but the page you requested was not found/i.test(body)) return false;

  const editLinks = await page.locator('a[href*="/account/profile"]').count();
  if (editLinks > 0) return true;

  const html = await page.content();
  return /"isOwner"\s*:\s*true|profile-owner|my-profile/i.test(html);
}

async function resolveFromPublicProfiles(
  page: Page,
  account: Pick<Account, "username" | "displayName">
): Promise<string | null> {
  for (const slug of slugCandidates(account)) {
    await gotoXvideos(page, `${BASE_URL}/profiles/${slug}`);
    if (await isOwnPublicProfile(page)) {
      const path = new URL(page.url()).pathname;
      const match = path.match(/\/profiles\/([^/]+)/);
      return match?.[1] ?? slug;
    }
  }
  return null;
}

async function resolveFromProfileSearch(
  page: Page,
  account: Pick<Account, "username" | "displayName">
): Promise<string | null> {
  const query = account.displayName?.trim() || account.username;
  const searchUrl = `${BASE_URL}/profile-search/?k=${encodeURIComponent(query)}&sex=Woman`;
  try {
    await gotoXvideos(page, searchUrl);
  } catch {
    return null;
  }

  const hrefs = await page
    .locator('a[href*="/profiles/"]')
    .evaluateAll((anchors) =>
      anchors
        .map((a) => (a as HTMLAnchorElement).getAttribute("href"))
        .filter((href): href is string => Boolean(href))
    );

  const slugs = [
    ...new Set(
      hrefs
        .map((href) => href.match(/\/profiles\/([^/?#]+)/)?.[1])
        .filter((slug): slug is string => Boolean(slug))
    ),
  ].slice(0, 12);

  for (const slug of slugs) {
    await gotoXvideos(page, `${BASE_URL}/profiles/${slug}`);
    if (await isOwnPublicProfile(page)) {
      return slug;
    }
  }

  return null;
}

export function extractProfileSlugFromHtml(html: string): string | null {
  const match = html.match(/"profile"\s*:\s*"([^"]+)"/);
  return match?.[1]?.trim() || null;
}

async function resolveFromAccountPage(page: Page): Promise<string | null> {
  await gotoXvideos(page, `${BASE_URL}/account`);
  return extractProfileSlugFromHtml(await page.content());
}

export async function resolveAccountProfileSlug(
  account: Account,
  proxy: Proxy | null
): Promise<string | null> {
  if (!account.cookies?.trim()) return null;

  const session = await openAccountSession({ ...account, proxy });
  const { page } = session;

  try {
    const fromAccount = await resolveFromAccountPage(page);
    if (fromAccount) return fromAccount;

    const direct = await resolveFromPublicProfiles(page, account);
    if (direct) return direct;

    return resolveFromProfileSearch(page, account);
  } catch {
    return null;
  } finally {
    await closeBrowser(session);
  }
}

