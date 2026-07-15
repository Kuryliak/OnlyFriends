const MAILTM_BASE = "https://api.mail.tm";

export type MailTmAddress = {
  name: string;
  address: string;
};

export type MailTmMessageSummary = {
  id: string;
  subject: string;
  intro: string;
  from: MailTmAddress;
  seen: boolean;
  createdAt: string;
};

export type MailTmMessage = MailTmMessageSummary & {
  text: string | null;
  html: string[];
};

export type MailTmInbox = {
  id: string;
  address: string;
  password: string;
  token: string;
};

type HydraCollection<T> = {
  "hydra:member": T[];
  "hydra:totalItems": number;
};

async function mailTmFetch<T>(
  path: string,
  init?: RequestInit & { token?: string }
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/ld+json");
  if (init?.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${MAILTM_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mail.tm ${res.status}: ${text || res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function randomLocalPart(): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `of_${stamp}_${rand}`;
}

function sanitizeUsernameLocalPart(username: string): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  return clean || "user";
}

async function createInboxAtAddress(address: string, password: string): Promise<MailTmInbox> {
  const account = await mailTmFetch<{ id: string; address: string }>("/accounts", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });

  const token = await getMailToken(address, password);

  return {
    id: account.id,
    address: account.address,
    password,
    token,
  };
}

export async function createInboxForUsername(username: string): Promise<MailTmInbox> {
  const domain = await getActiveDomain();
  const password = `Of!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const address = `of_${sanitizeUsernameLocalPart(username)}_${Date.now().toString(36)}@${domain}`;
  return createInboxAtAddress(address, password);
}

export async function getActiveDomain(): Promise<string> {
  const data = await mailTmFetch<HydraCollection<{ domain: string; isActive: boolean }>>(
    "/domains"
  );
  const domain = data["hydra:member"].find((d) => d.isActive)?.domain;
  if (!domain) throw new Error("No active Mail.tm domain available");
  return domain;
}

export async function getMailToken(address: string, password: string): Promise<string> {
  const tokenRes = await mailTmFetch<{ token: string }>("/token", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  return tokenRes.token;
}

export async function createInbox(): Promise<MailTmInbox> {
  const domain = await getActiveDomain();
  const password = `Of!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const address = `${randomLocalPart()}@${domain}`;
  return createInboxAtAddress(address, password);
}

export async function listMessages(token: string): Promise<MailTmMessageSummary[]> {
  const data = await mailTmFetch<HydraCollection<MailTmMessageSummary>>("/messages", { token });
  return data["hydra:member"] ?? [];
}

export async function getMessage(token: string, id: string): Promise<MailTmMessage> {
  return mailTmFetch<MailTmMessage>(`/messages/${id}`, { token });
}

const LINK_REGEX = /https?:\/\/[^\s<>"'\]]+/gi;

/** Decode HTML entities + quoted-printable soft breaks so verify tokens stay intact. */
export function decodeEmailContent(content: string): string {
  return content
    .replace(/=\r?\n/g, "")
    .replace(/=3D/gi, "=")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function normalizeLink(raw: string): string {
  let link = raw.trim();
  // strip trailing punctuation / broken HTML leftovers
  link = link.replace(/[),.]+$/g, "");
  link = link.replace(/&amp;/gi, "&");
  // common mail client wrap artifacts
  link = link.replace(/\s+/g, "");
  try {
    // URL constructor normalizes encoding
    const u = new URL(link);
    return u.toString();
  } catch {
    return link;
  }
}

export function extractLinks(content: string): string[] {
  const decoded = decodeEmailContent(content);
  const fromHref = [...decoded.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const bare = decoded.match(LINK_REGEX) ?? [];
  const all = [...fromHref, ...bare].map(normalizeLink).filter((l) => /^https?:\/\//i.test(l));
  return [...new Set(all)];
}

export function extractVerificationLinks(content: string): string[] {
  return extractLinks(content).filter((link) =>
    /verify|confirm|activation|account|xvideos/i.test(link)
  );
}

/** Higher score = more likely the real XVIDEOS email-validation URL. */
export function scoreXvideosVerificationLink(link: string): number {
  let score = 0;
  const lower = link.toLowerCase();
  if (lower.includes("xvideos.com")) score += 15;
  if (/account\/email\/valid/i.test(link)) score += 80;
  if (/\/validat/i.test(link)) score += 50;
  if (/verif/i.test(link)) score += 40;
  if (/[?&](token|key|hash|code|t|k)=/i.test(link)) score += 30;
  if (/email/i.test(link)) score += 10;
  if (/confirm/i.test(link)) score += 15;
  if (/unsubscribe|privacy|support|help|cdn|static|img|avatar|favicon/i.test(lower)) score -= 120;
  if (/xvideos\.com\/?(\?|$)/i.test(link)) score -= 25;
  if (/xvideos\.com\/(tags|video|profiles|channels)/i.test(lower)) score -= 40;
  return score;
}

export function extractXvideosVerificationLinks(content: string): string[] {
  const links = extractLinks(content)
    .filter((link) => {
      const s = scoreXvideosVerificationLink(link);
      // keep any plausible verify URL, not only strict xvideos+keyword pairs
      return s >= 25;
    })
    .sort((a, b) => scoreXvideosVerificationLink(b) - scoreXvideosVerificationLink(a));
  return [...new Set(links)];
}

export async function pollForXvideosVerificationLinks(
  token: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<string[]> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const intervalMs = options?.intervalMs ?? 5_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await listMessages(token);
    // newest first — Mail.tm usually returns newest at start, but sort by date
    const ordered = [...messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const collected: string[] = [];
    for (const message of ordered) {
      const full = await getMessage(token, message.id);
      const htmlParts = Array.isArray(full.html) ? full.html : full.html ? [String(full.html)] : [];
      const content = [full.subject, full.intro, full.text, ...htmlParts].filter(Boolean).join("\n");
      collected.push(...extractXvideosVerificationLinks(content));
    }

    const unique = [...new Set(collected)].sort(
      (a, b) => scoreXvideosVerificationLink(b) - scoreXvideosVerificationLink(a)
    );
    if (unique.length > 0) return unique;

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return [];
}

export async function pollForXvideosVerificationLink(
  token: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<string | null> {
  const links = await pollForXvideosVerificationLinks(token, options);
  return links[0] ?? null;
}