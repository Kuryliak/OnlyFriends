import { prisma } from "@/lib/db";
import { getAutoWarmupConfig, refreshAutoWarmupConfig } from "@/lib/settings/auto-warmup";

export async function queueIdleWarmupJobs(availableSlots: number): Promise<number> {
  await refreshAutoWarmupConfig();
  const config = getAutoWarmupConfig();

  if (!config.enabled || availableSlots <= 0) return 0;

  // Never steal slots while friend jobs are waiting — traffic first
  const pendingFriends = await prisma.job.count({
    where: { type: "ADD_FRIENDS", status: "PENDING" },
  });
  if (pendingFriends > 0) return 0;

  const maxQueue = Math.min(config.maxPerCycle, availableSlots);
  const intervalSince = new Date(Date.now() - config.intervalMinutes * 60 * 1000);

  const [running, pending] = await Promise.all([
    prisma.job.findMany({
      where: { status: "RUNNING", accountId: { not: null } },
      select: { accountId: true },
    }),
    prisma.job.findMany({
      where: { status: "PENDING", accountId: { not: null } },
      select: { accountId: true, type: true },
    }),
  ]);

  const busyAccountIds = new Set<string>();
  for (const job of running) {
    if (job.accountId) busyAccountIds.add(job.accountId);
  }
  for (const job of pending) {
    if (job.accountId) busyAccountIds.add(job.accountId);
  }

  const candidates = await prisma.account.findMany({
    where: {
      status: "ACTIVE",
      cookies: { not: null },
      ...(busyAccountIds.size > 0 ? { id: { notIn: [...busyAccountIds] } } : {}),
    },
    orderBy: [{ lastActive: "asc" }, { createdAt: "asc" }],
    take: maxQueue * 5,
    select: { id: true, username: true },
  });

  if (!candidates.length) return 0;

  const candidateIds = candidates.map((a) => a.id);
  const [recentWarmups, pendingWarmups] = await Promise.all([
    prisma.job.findMany({
      where: {
        accountId: { in: candidateIds },
        type: "WARMUP_SCROLL",
        status: "COMPLETED",
        completedAt: { gte: intervalSince },
      },
      select: { accountId: true },
    }),
    prisma.job.findMany({
      where: {
        accountId: { in: candidateIds },
        type: "WARMUP_SCROLL",
        status: "PENDING",
      },
      select: { accountId: true },
    }),
  ]);

  const recentlyWarmed = new Set(recentWarmups.map((j) => j.accountId).filter(Boolean) as string[]);
  const pendingWarmup = new Set(pendingWarmups.map((j) => j.accountId).filter(Boolean) as string[]);

  let queued = 0;
  for (const account of candidates) {
    if (queued >= maxQueue) break;
    if (recentlyWarmed.has(account.id) || pendingWarmup.has(account.id)) continue;

    await prisma.job.create({
      data: {
        type: "WARMUP_SCROLL",
        accountId: account.id,
        payload: JSON.stringify({
          durationMinutes: config.durationMinutes,
          auto: true,
        }),
      },
    });
    queued += 1;
  }

  if (queued > 0) {
    console.log(`[worker] Auto-warmup: queued ${queued} idle account(s)`);
  }

  return queued;
}

export async function countAutoWarmupEligible(): Promise<number> {
  await refreshAutoWarmupConfig();
  const config = getAutoWarmupConfig();
  if (!config.enabled) return 0;

  const intervalSince = new Date(Date.now() - config.intervalMinutes * 60 * 1000);

  const busyJobs = await prisma.job.findMany({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      accountId: { not: null },
    },
    select: { accountId: true },
  });
  const busyIds = new Set(busyJobs.map((j) => j.accountId).filter(Boolean) as string[]);

  const accounts = await prisma.account.findMany({
    where: {
      status: "ACTIVE",
      cookies: { not: null },
      ...(busyIds.size > 0 ? { id: { notIn: [...busyIds] } } : {}),
    },
    select: { id: true },
  });

  if (!accounts.length) return 0;

  const ids = accounts.map((a) => a.id);
  const recent = await prisma.job.findMany({
    where: {
      accountId: { in: ids },
      type: "WARMUP_SCROLL",
      status: "COMPLETED",
      completedAt: { gte: intervalSince },
    },
    select: { accountId: true },
  });
  const recentSet = new Set(recent.map((j) => j.accountId));

  return accounts.filter((a) => !recentSet.has(a.id)).length;
}