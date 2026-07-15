import type { Account, Proxy } from "@prisma/client";
import type { Page } from "playwright";
import { launchBrowser, closeBrowser } from "../browser";
import { fingerprintForAccount } from "@/lib/proxy/fingerprint";
import { pickUserAgent } from "../human-behavior";
import { resolveCaptchaOrPause } from "../captcha";
import { randomDelay } from "../human-behavior";
import { gotoXvideos } from "../overlays";
import {
  buildProfileSearchUrl,
  usesBrowseListUrl,
  type ProfileSearchFilters,
} from "@/lib/profile-search/filters";
import { profileMatchesCountry } from "@/lib/profile-search/countries";

export type ProfileSearchResult = {
  username: string;
  displayName: string;
  profileUrl: string;
  avatarUrl: string | null;
  meta: string;
  isChannel: boolean;
};

export type ProfileSearchResponse =
  | { success: true; results: ProfileSearchResult[]; total: number; page: number; sourceUrl: string }
  | { success: false; error: string; captcha?: boolean };

function extractUsername(href: string): string {
  const clean = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "");
  if (clean.startsWith("profiles/")) {
    return clean.split("/")[1] ?? clean;
  }
  return clean.split("/")[0] ?? clean;
}

async function parseResults(page: Page): Promise<ProfileSearchResult[]> {
  const parsed = await page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll(".thumb-block-profile, .thumb-block.thumb-block-profile")
    );

    return blocks.map((block) => {
      const link = block.querySelector("a[href]") as HTMLAnchorElement | null;
      const href = link?.getAttribute("href") ?? "";
      const img = (block.querySelector("img") as HTMLImageElement | null)?.src ?? null;
      const nameEl =
        block.querySelector(".profile-name a") ??
        block.querySelector(".name a") ??
        block.querySelector("p a") ??
        link;
      const metaEl = block.querySelector(".profile-infos, .metadata, .thumb-under");

      return {
        href,
        img,
        name: nameEl?.textContent?.trim() ?? "",
        meta: metaEl?.textContent?.trim().replace(/\s+/g, " ") ?? "",
      };
    });
  });

  const seen = new Set<string>();
  const results: ProfileSearchResult[] = [];

  for (const item of parsed) {
    if (!item.href || !item.name) continue;
    const username = extractUsername(item.href);
    if (!username || seen.has(username)) continue;
    seen.add(username);

    const isChannel =
      !item.href.includes("/profiles/") || item.meta.toLowerCase().includes("channel");

    results.push({
      username,
      displayName: item.name,
      profileUrl: item.href.startsWith("http")
        ? item.href
        : `https://www.xvideos.com${item.href.startsWith("/") ? "" : "/"}${item.href}`,
      avatarUrl: item.img,
      meta: item.meta,
      isChannel,
    });
  }

  return results;
}

function applyCountryFilter(
  results: ProfileSearchResult[],
  countryCode?: string
): ProfileSearchResult[] {
  if (!countryCode) return results;

  return results.filter((r) => {
    if (r.isChannel) return false;
    if (!r.profileUrl.includes("/profiles/")) return false;
    return profileMatchesCountry(r.meta, countryCode);
  });
}

export type CollectPhaseLabel = "strict" | "broader" | "unverified" | "newProfiles";

export type CollectProgress = {
  phase: number;
  phaseTotal: number;
  phaseLabel: CollectPhaseLabel;
  page: number;
  found: number;
  requested: number;
};

export type CollectProfileTargetsResponse =
  | {
      success: true;
      targets: string[];
      pagesScanned: number;
      phasesUsed: number;
      widened: boolean;
    }
  | { success: false; error: string; captcha?: boolean };

const MAX_COLLECT_PAGES = 150;
const EMPTY_PAGE_BREAK = 2;
const NO_ADD_PAGE_BREAK = 5;

function buildCollectPhases(
  filters: ProfileSearchFilters,
  maxCount: number
): Array<{ filters: ProfileSearchFilters; label: CollectPhaseLabel }> {
  const phases: Array<{ filters: ProfileSearchFilters; label: CollectPhaseLabel }> = [
    { filters, label: "strict" },
  ];

  if (maxCount > 50 && filters.country) {
    phases.push({
      filters: { ...filters, country: "", page: 1 },
      label: "broader",
    });
  }

  if (maxCount > 100 && filters.verified !== false) {
    phases.push({
      filters: {
        ...filters,
        country: "",
        verified: false,
        listMode: "/profileslist/unverified",
        page: 1,
      },
      label: "unverified",
    });
  }

  if (maxCount > 150) {
    phases.push({
      filters: {
        ...filters,
        country: "",
        keywords: "",
        listMode: "/profiles-index",
        verified: true,
        sex: "Woman",
        createDate: 40,
        orderby: "last_activity",
        page: 1,
      },
      label: "newProfiles",
    });
  }

  const seen = new Set<string>();
  return phases.filter((phase) => {
    const key = JSON.stringify(phase.filters);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ingestResults(
  results: ProfileSearchResult[],
  seen: Set<string>,
  targets: string[],
  maxCount: number
): number {
  let added = 0;
  for (const r of results) {
    if (r.isChannel || seen.has(r.username)) continue;
    seen.add(r.username);
    targets.push(r.username);
    added++;
    if (targets.length >= maxCount) break;
  }
  return added;
}

async function scanPhase(
  page: Page,
  phaseFilters: ProfileSearchFilters,
  maxCount: number,
  seen: Set<string>,
  targets: string[],
  account: Account | null | undefined,
  meta: { phase: number; phaseTotal: number; phaseLabel: CollectPhaseLabel },
  onProgress?: (progress: CollectProgress) => void
): Promise<number> {
  let pageNum = 1;
  let emptyStreak = 0;
  let noAddStreak = 0;
  let pagesScanned = 0;

  while (targets.length < maxCount && pageNum <= MAX_COLLECT_PAGES) {
    onProgress?.({
      phase: meta.phase,
      phaseTotal: meta.phaseTotal,
      phaseLabel: meta.phaseLabel,
      page: pageNum,
      found: targets.length,
      requested: maxCount,
    });

    const url = buildProfileSearchUrl({ ...phaseFilters, page: pageNum });
    await gotoXvideos(page, url);
    await randomDelay(pageNum === 1 ? 1200 : 600, pageNum === 1 ? 2000 : 1100);

    if (account && (await resolveCaptchaOrPause(page, account)) === "captcha") {
      throw new Error("CAPTCHA");
    }

    let results = await parseResults(page);
    if (phaseFilters.country && usesBrowseListUrl(phaseFilters)) {
      results = applyCountryFilter(results, phaseFilters.country);
    }

    pagesScanned++;

    if (!results.length) {
      emptyStreak++;
      if (emptyStreak >= EMPTY_PAGE_BREAK) break;
      pageNum++;
      continue;
    }
    emptyStreak = 0;

    const before = targets.length;
    ingestResults(results, seen, targets, maxCount);
    const added = targets.length - before;

    if (added === 0) {
      noAddStreak++;
      if (noAddStreak >= NO_ADD_PAGE_BREAK) break;
    } else {
      noAddStreak = 0;
    }

    pageNum++;
  }

  return pagesScanned;
}

/** Paginate in a single browser session; widens filters if the strict search runs dry. */
export async function collectProfileTargets(
  filters: ProfileSearchFilters,
  maxCount: number,
  account?: Account | null,
  proxy?: Proxy | null,
  options?: { onProgress?: (progress: CollectProgress) => void }
): Promise<CollectProfileTargetsResponse> {
  const session = await launchBrowser({
    proxy: proxy ?? null,
    userAgent: account?.userAgent ?? pickUserAgent(),
    cookies: account?.cookies ?? null,
    account: account ?? null,
    fingerprint: account ? fingerprintForAccount(account.id, proxy?.country) : undefined,
  });
  const { page } = session;
  const targets: string[] = [];
  const seen = new Set<string>();
  const phases = buildCollectPhases(filters, maxCount);

  try {
    let totalPages = 0;
    let phasesUsed = 0;

    for (let i = 0; i < phases.length && targets.length < maxCount; i++) {
      const { filters: phaseFilters, label } = phases[i]!;
      phasesUsed++;

      const scanned = await scanPhase(
        page,
        phaseFilters,
        maxCount,
        seen,
        targets,
        account,
        { phase: i + 1, phaseTotal: phases.length, phaseLabel: label },
        options?.onProgress
      );
      totalPages += scanned;
    }

    return {
      success: true,
      targets: targets.slice(0, maxCount),
      pagesScanned: totalPages,
      phasesUsed,
      widened: phasesUsed > 1,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "CAPTCHA") {
      return { success: false, error: "Captcha detected", captcha: true };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Profile collection failed",
    };
  } finally {
    await closeBrowser(session);
  }
}

export async function searchProfiles(
  filters: ProfileSearchFilters,
  account?: Account | null,
  proxy?: Proxy | null
): Promise<ProfileSearchResponse> {
  const url = buildProfileSearchUrl(filters);

  const session = await launchBrowser({
    proxy: proxy ?? null,
    userAgent: account?.userAgent ?? pickUserAgent(),
    cookies: account?.cookies ?? null,
    account: account ?? null,
    fingerprint: account ? fingerprintForAccount(account.id, proxy?.country) : undefined,
  });
  const { page } = session;

  try {
    await gotoXvideos(page, url);
    await randomDelay(1500, 2500);

    if (account && (await resolveCaptchaOrPause(page, account)) === "captcha") {
      return { success: false, error: "Captcha detected", captcha: true };
    }

    let results = await parseResults(page);
    if (filters.country && usesBrowseListUrl(filters)) {
      results = applyCountryFilter(results, filters.country);
    }

    return {
      success: true,
      results,
      total: results.length,
      page: filters.page ?? 1,
      sourceUrl: page.url(),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Profile search failed",
    };
  } finally {
    await closeBrowser(session);
  }
}