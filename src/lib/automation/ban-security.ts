import type { AccountStatus, JobStatus, JobType } from "@prisma/client";
import { OUTREACH_JOB_TYPES } from "@/lib/jobs/worker-config";
import { isStealthEnabledSync } from "@/lib/settings/stealth";

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

export const banSecurityConfig = {
  /** Require an active proxy for outreach jobs (friends/subscribe/message). */
  requireProxyForOutreach: readBool("REQUIRE_PROXY_FOR_OUTREACH", true),
  /** Delay between outreach actions (friend/subscribe/message targets). */
  outreachDelayMinMs: readInt("OUTREACH_DELAY_MIN_MS", 5000, 1000, 120_000),
  outreachDelayMaxMs: readInt("OUTREACH_DELAY_MAX_MS", 12_000, 2000, 180_000),
  /** Extra pause after a batch of outreach actions on one account. */
  outreachBatchPauseMinMs: readInt("OUTREACH_BATCH_PAUSE_MIN_MS", 15_000, 0, 300_000),
  outreachBatchPauseMaxMs: readInt("OUTREACH_BATCH_PAUSE_MAX_MS", 35_000, 0, 600_000),
  /** Max outreach targets per account per rolling hour (0 = unlimited). */
  outreachHourlyCapPerAccount: readInt("OUTREACH_HOURLY_CAP_PER_ACCOUNT", 40, 0, 500),
  /** Stagger subscribe jobs after friends for same bombing batch. */
  subscribeStaggerMs: readInt("SUBSCRIBE_STAGGER_MS", 45_000, 0, 600_000),
};

/** Stealth overrides — slower outreach, lower caps, proxy on every job. */
const STEALTH_OVERRIDES = {
  outreachDelayMinMs: 18_000,
  outreachDelayMaxMs: 45_000,
  outreachBatchPauseMinMs: 60_000,
  outreachBatchPauseMaxMs: 120_000,
  outreachHourlyCapPerAccount: 12,
  subscribeStaggerMs: 120_000,
  requireProxyForAllJobs: true,
} as const;

export function effectiveBanSecurityConfig() {
  if (!isStealthEnabledSync()) return banSecurityConfig;
  return {
    ...banSecurityConfig,
    requireProxyForOutreach: true,
    outreachDelayMinMs: STEALTH_OVERRIDES.outreachDelayMinMs,
    outreachDelayMaxMs: STEALTH_OVERRIDES.outreachDelayMaxMs,
    outreachBatchPauseMinMs: STEALTH_OVERRIDES.outreachBatchPauseMinMs,
    outreachBatchPauseMaxMs: STEALTH_OVERRIDES.outreachBatchPauseMaxMs,
    outreachHourlyCapPerAccount: STEALTH_OVERRIDES.outreachHourlyCapPerAccount,
    subscribeStaggerMs: STEALTH_OVERRIDES.subscribeStaggerMs,
    requireProxyForAllJobs: STEALTH_OVERRIDES.requireProxyForAllJobs,
  };
}

export function isStealthProxyRequiredForJob(jobType?: JobType): boolean {
  const cfg = effectiveBanSecurityConfig() as ReturnType<typeof effectiveBanSecurityConfig> & {
    requireProxyForAllJobs?: boolean;
  };
  if (cfg.requireProxyForAllJobs) return true;
  return Boolean(jobType && isOutreachJob(jobType) && cfg.requireProxyForOutreach);
}

export function isOutreachJob(type: JobType): boolean {
  return OUTREACH_JOB_TYPES.has(type);
}

export function isAccountEligibleForJob(
  account: { status: AccountStatus; cookies: string | null },
  job: { type: JobType; status: JobStatus }
): string | null {
  if (account.status === "ERROR") {
    return "Аккаунт в статусе «Ошибка» — предыдущая задача не удалась. Нажмите «Исправить» на странице аккаунта или в задачах";
  }

  if (account.status === "BANNED") {
    return "Аккаунт заблокирован на XVIDEOS";
  }

  if (isOutreachJob(job.type)) {
    if (account.status !== "ACTIVE" && account.status !== "CAPTCHA") {
      return "Для рассылки аккаунт должен быть активен";
    }
    if (!account.cookies?.trim()) {
      return "Нет сохранённой сессии XVIDEOS — войдите заново";
    }
  }

  if (account.status === "CAPTCHA" && job.status !== "PAUSED_CAPTCHA" && job.status !== "RUNNING") {
    return "Ожидается капча — откройте «Задачи» и нажмите «Продолжить»";
  }

  return null;
}

export function outreachActionDelay(): Promise<void> {
  const cfg = effectiveBanSecurityConfig();
  const min = cfg.outreachDelayMinMs;
  const max = Math.max(min, cfg.outreachDelayMaxMs);
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function outreachBatchPause(): Promise<void> {
  const cfg = effectiveBanSecurityConfig();
  const min = cfg.outreachBatchPauseMinMs;
  const max = Math.max(min, cfg.outreachBatchPauseMaxMs);
  if (max <= 0) return Promise.resolve();
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function banSecuritySummary(): string {
  const cfg = effectiveBanSecurityConfig();
  const stealth = isStealthEnabledSync() ? "stealth=on" : "stealth=off";
  return [
    stealth,
    `proxyRequired=${cfg.requireProxyForOutreach}`,
    `outreachDelay=${cfg.outreachDelayMinMs}-${cfg.outreachDelayMaxMs}ms`,
    `hourlyCap=${cfg.outreachHourlyCapPerAccount || "off"}`,
  ].join(", ");
}

export async function assertOutreachHourlyCap(accountId: string): Promise<void> {
  const cap = effectiveBanSecurityConfig().outreachHourlyCapPerAccount;
  if (!cap) return;

  const since = new Date(Date.now() - 60 * 60 * 1000);
  const { prisma } = await import("@/lib/db");
  const completed = await prisma.job.count({
    where: {
      accountId,
      type: { in: ["ADD_FRIENDS", "SUBSCRIBE", "SEND_MESSAGE"] },
      status: "COMPLETED",
      completedAt: { gte: since },
    },
  });

  if (completed >= cap) {
    throw new Error(`Hourly outreach cap reached (${cap} jobs/hour) — wait before retrying`);
  }
}

export async function waitSubscribeStagger(accountId: string): Promise<void> {
  const staggerMs = effectiveBanSecurityConfig().subscribeStaggerMs;
  if (staggerMs <= 0) return;

  const { prisma } = await import("@/lib/db");
  const recentFriends = await prisma.job.findFirst({
    where: {
      accountId,
      type: "ADD_FRIENDS",
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - staggerMs) },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  if (!recentFriends?.completedAt) return;

  const elapsed = Date.now() - recentFriends.completedAt.getTime();
  const remaining = staggerMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}