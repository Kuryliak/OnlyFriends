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

const LINK_REGEX = /https?:\/\/[^\s<>"']+/gi;

export function extractLinks(content: string): string[] {
  const matches = content.match(LINK_REGEX) ?? [];
  return [...new Set(matches.map((link) => link.replace(/[),.]+$/, "")))];
}

export function extractVerificationLinks(content: string): string[] {
  return extractLinks(content).filter((link) =>
    /verify|confirm|activation|account|xvideos/i.test(link)
  );
}

export function extractXvideosVerificationLinks(content: string): string[] {
  return extractLinks(content).filter(
    (link) =>
      /xvideos\.com/i.test(link) &&
      /valid|verif|confirm|token|key|email/i.test(link)
  );
}

export async function pollForXvideosVerificationLink(
  token: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const intervalMs = options?.intervalMs ?? 5_000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const messages = await listMessages(token);
    for (const message of messages) {
      const full = await getMessage(token, message.id);
      const content = [full.subject, full.intro, full.text, ...full.html].filter(Boolean).join("\n");
      const links = extractXvideosVerificationLinks(content);
      if (links[0]) return links[0];
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}