import { prisma } from "@/lib/db";

export const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function since24h(): Date {
  return new Date(Date.now() - STATS_WINDOW_MS);
}

export function sinceDays(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function parseJobResult(result: string | null): Record<string, unknown> {
  if (!result) return {};
  try {
    const parsed = JSON.parse(result);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function countResultEntries(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length === 0) return 0;
  const first = value[0];
  if (first && typeof first === "object" && "user" in first) {
    return value.filter((entry) => (entry as { user?: string }).user !== "*").length;
  }
  return value.length;
}

export async function sumOutreachJobField(
  type: "ADD_FRIENDS" | "SUBSCRIBE",
  field: "added" | "subscribed" | "failed" | "skipped",
  since: Date
): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: {
      type,
      status: { in: ["COMPLETED", "FAILED", "PAUSED_CAPTCHA"] },
      completedAt: { gte: since },
      result: { not: null },
    },
    select: { result: true },
  });

  return jobs.reduce((sum, job) => {
    const parsed = parseJobResult(job.result);
    return sum + countResultEntries(parsed[field]);
  }, 0);
}

export async function countFriendActions24h(
  since: Date,
  options?: { status?: "failed" | "skipped"; friendsOnly?: boolean }
): Promise<number> {
  const prefix = options?.friendsOnly === false ? "[subscribe]" : "[friends]";

  return prisma.friendAction.count({
    where: {
      createdAt: { gte: since },
      errorMessage: { startsWith: prefix },
      ...(options?.status ? { status: options.status } : {}),
    },
  });
}

export async function countNewTargets24h(since: Date): Promise<number> {
  return prisma.friendTargetClaim.count({
    where: {
      createdAt: { gte: since },
      status: { in: ["added", "subscribed"] },
    },
  });
}

export async function countOutreachAccountsOnProxy24h(since: Date): Promise<number> {
  const jobs = await prisma.job.findMany({
    where: {
      type: { in: ["ADD_FRIENDS", "SUBSCRIBE"] },
      status: "COMPLETED",
      completedAt: { gte: since },
      account: { proxyId: { not: null } },
    },
    select: { accountId: true },
    distinct: ["accountId"],
  });
  return jobs.length;
}