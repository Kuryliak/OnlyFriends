export type BrowserFingerprint = {
  viewport: { width: number; height: number };
  timezoneId: string;
  locale: string;
  languages: string[];
};

const COUNTRY_TIMEZONE: Record<string, string> = {
  US: "America/New_York",
  CA: "America/Toronto",
  GB: "Europe/London",
  UK: "Europe/London",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  PL: "Europe/Warsaw",
  RU: "Europe/Moscow",
  UA: "Europe/Kyiv",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  AU: "Australia/Sydney",
  JP: "Asia/Tokyo",
  IN: "Asia/Kolkata",
};

const VIEWPORT_PRESETS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function timezoneForCountry(country?: string | null): string {
  if (!country) return "America/New_York";
  const code = country.trim().toUpperCase();
  return COUNTRY_TIMEZONE[code] ?? "America/New_York";
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
] as const;

/** Stable UA per account — same fingerprint every session. */
export function userAgentForAccount(accountId: string): string {
  return USER_AGENTS[hashSeed(accountId) % USER_AGENTS.length];
}

export function fingerprintForAccount(
  accountId: string,
  proxyCountry?: string | null
): BrowserFingerprint {
  const hash = hashSeed(accountId);
  const viewport = VIEWPORT_PRESETS[hash % VIEWPORT_PRESETS.length];
  const timezoneId = timezoneForCountry(proxyCountry);
  const locale = proxyCountry?.toUpperCase() === "RU" ? "ru-RU" : "en-US";

  return {
    viewport: { width: viewport.width, height: viewport.height },
    timezoneId,
    locale,
    languages: locale.startsWith("ru") ? ["ru-RU", "ru", "en-US", "en"] : ["en-US", "en"],
  };
}