import type { AccountStatus, Job, JobType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAccountEligibleForJob } from "@/lib/automation/ban-security";
import { getWorkerConfig, OUTREACH_JOB_TYPES } from "@/lib/jobs/worker-config";

type JobCandidate = Job & {
  account: {
    id: string;
    proxyId: string | null;
    status: AccountStatus;
    cookies: string | null;
    cooldownUntil: Date | null;
  } | null;
};

export type RunningSnapshot = {
  totalRunning: number;
  busyAccountIds: Set<string>;
  proxyCounts: Map<string, number>;
  outreachRunning: number;
};

export function proxyKey(proxyId: string | null | undefined): string {
  return proxyId ?? "__direct__";
}

export function buildRunningSnapshot(
  jobs: Array<{
    type: JobType;
    accountId: string | null;
    account: { proxyId: string | null } | null;
  }>
): RunningSnapshot {
  const busyAccountIds = new Set<string>();
  const proxyCounts = new Map<string, number>();
  let outreachRunning = 0;

  for (const job of jobs) {
    if (job.accountId) busyAccountIds.add(job.accountId);

    const key = proxyKey(job.account?.proxyId);
    proxyCounts.set(key, (proxyCounts.get(key) ?? 0) + 1);

    if (OUTREACH_JOB_TYPES.has(job.type)) outreachRunning += 1;
  }

  return {
    totalRunning: jobs.length,
    busyAccountIds,
    proxyCounts,
    outreachRunning,
  };
}

/** Lower number = higher priority. Friends traffic first. */
export function jobClaimPriority(type: JobType): number {
  if (type === "ADD_FRIENDS") return 0;
  if (type === "SUBSCRIBE" || type === "SEND_MESSAGE") return 1;
  if (type === "WARMUP_SCROLL") return 3;
  return 2;
}

export function canClaimJob(job: JobCandidate, state: RunningSnapshot): boolean {
  const config = getWorkerConfig();
  if (state.totalRunning >= config.concurrency) return false;

  if (job.accountId && state.busyAccountIds.has(job.accountId)) return false;

  const key = proxyKey(job.account?.proxyId);
  if ((state.proxyCounts.get(key) ?? 0) >= config.proxyConcurrency) return false;

  if (OUTREACH_JOB_TYPES.has(job.type)) {
    if (state.outreachRunning >= config.outreachConcurrency) return false;
  }

  return true;
}

export function trackClaimedJob(job: JobCandidate, state: RunningSnapshot): void {
  state.totalRunning += 1;
  if (job.accountId) state.busyAccountIds.add(job.accountId);

  const key = proxyKey(job.account?.proxyId);
  state.proxyCounts.set(key, (state.proxyCounts.get(key) ?? 0) + 1);

  if (OUTREACH_JOB_TYPES.has(job.type)) state.outreachRunning += 1;
}

export async function getRunningSnapshot(): Promise<RunningSnapshot> {
  const running = await prisma.job.findMany({
    where: { status: "RUNNING" },
    select: {
      type: true,
      accountId: true,
      account: { select: { proxyId: true } },
    },
  });
  return buildRunningSnapshot(running);
}

export async function atomicClaimJob(jobId: string): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });
  if (result.count !== 1) return false;

  const running = await prisma.job.count({ where: { status: "RUNNING" } });
  if (running <= getWorkerConfig().concurrency) return true;

  await prisma.job.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: { status: "PENDING", startedAt: null },
  });
  return false;
}

export async function pickNextClaimableJob(
  state: RunningSnapshot,
  preferredJobId?: string
): Promise<JobCandidate | null> {
  const pending = await prisma.job.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      account: {
        select: {
          id: true,
          proxyId: true,
          status: true,
          cookies: true,
          cooldownUntil: true,
        },
      },
    },
  });

  if (!pending.length) return null;

  const byPriority = [...pending].sort((a, b) => {
    const diff = jobClaimPriority(a.type) - jobClaimPriority(b.type);
    if (diff !== 0) return diff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const ordered = preferredJobId
    ? [
        ...byPriority.filter((job) => job.id === preferredJobId),
        ...byPriority.filter((job) => job.id !== preferredJobId),
      ]
    : byPriority;

  for (const job of ordered) {
    if (job.account) {
      const ineligible = isAccountEligibleForJob(job.account, job);
      if (ineligible) continue;
    }
    if (canClaimJob(job, state)) return job;
  }

  return null;
}