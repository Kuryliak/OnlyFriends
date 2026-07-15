import { prisma } from "@/lib/db";
import {
  countFriendActions24h,
  countNewTargets24h,
  sinceDays,
  sumOutreachJobField,
} from "@/lib/stats/dashboard";
import {
  chartBucketCount,
  isHourlyChart,
  sinceForRange,
  type StatsRange,
} from "@/lib/stats/range";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function hourKey(date: Date): string {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 13);
}

function buildDailyBuckets(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

function buildHourlyBuckets(hours: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    keys.push(hourKey(d));
  }
  return keys;
}

type ActivityBucket = { friends: number; subscribes: number; failed: number };

function initBucketMap(keys: string[]): Record<string, ActivityBucket> {
  return Object.fromEntries(
    keys.map((k) => [k, { friends: 0, subscribes: 0, failed: 0 }])
  );
}

function dateFilter(since: Date | null) {
  return since ? { createdAt: { gte: since } } : {};
}

async function outreachWindow(since: Date | null) {
  if (!since) {
    const [friends, subscribes, failed, skipped, unique] = await Promise.all([
      prisma.friendTargetClaim.count({ where: { status: "added" } }),
      prisma.friendTargetClaim.count({ where: { status: "subscribed" } }),
      prisma.friendAction.count({ where: { status: "failed" } }),
      prisma.friendAction.count({ where: { status: "skipped" } }),
      prisma.friendTargetClaim.count({
        where: { status: { in: ["added", "subscribed"] } },
      }),
    ]);
    return { friends, subscribes, failed, skipped, unique };
  }

  const [friends, subscribesFailed, friendsFailed, friendsSkipped, unique, subscribes] =
    await Promise.all([
      sumOutreachJobField("ADD_FRIENDS", "added", since),
      countFriendActions24h(since, { status: "failed", friendsOnly: false }),
      countFriendActions24h(since, { status: "failed" }),
      countFriendActions24h(since, { status: "skipped" }),
      countNewTargets24h(since),
      sumOutreachJobField("SUBSCRIBE", "subscribed", since),
    ]);

  return {
    friends,
    subscribes,
    failed: friendsFailed + subscribesFailed,
    skipped: friendsSkipped,
    unique,
  };
}

export async function buildGlobalStats(range: StatsRange = "24h") {
  const since = sinceForRange(range);
  const hourly = isHourlyChart(range);
  const bucketKeys = hourly ? buildHourlyBuckets(chartBucketCount(range)) : buildDailyBuckets(chartBucketCount(range));
  const daily = initBucketMap(bucketKeys);
  const chartSince = hourly ? since : since ?? sinceDays(chartBucketCount(range));

  const periodFilter = dateFilter(since);
  const chartFilter = chartSince ? { createdAt: { gte: chartSince } } : {};

  const [
    accountTotal,
    accountByStatus,
    emailVerified,
    accountsInGroup,
    mutualFriendsSum,
    claimByStatus,
    actionByStatus,
    jobByStatus,
    jobByType,
    batchByStatus,
    recentBatches,
    batchesTotal,
    topByOutreach,
    topByMutual,
    topByFailures,
    recentFailedActions,
    period,
    groupsCount,
    friendActionsChart,
    outreachJobsChart,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.account.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.account.count({ where: { emailVerified: true } }),
    prisma.account.count({ where: { groupId: { not: null } } }),
    prisma.account.aggregate({ _sum: { mutualFriendsCount: true, friendRequestsSentCount: true } }),
    prisma.friendTargetClaim.groupBy({
      by: ["status"],
      where: periodFilter,
      _count: { _all: true },
    }),
    prisma.friendAction.groupBy({
      by: ["status"],
      where: periodFilter,
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["status"],
      where: periodFilter,
      _count: { _all: true },
    }),
    prisma.job.groupBy({
      by: ["type"],
      where: periodFilter,
      _count: { _all: true },
    }),
    prisma.outreachBatch.groupBy({
      by: ["status"],
      where: periodFilter,
      _count: { _all: true },
    }),
    prisma.outreachBatch.findMany({
      where: periodFilter,
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.outreachBatch.count({ where: periodFilter }),
    buildTopOutreachAccounts(since, 15),
    prisma.account.findMany({
      orderBy: { mutualFriendsCount: "desc" },
      take: 10,
      select: {
        id: true,
        username: true,
        mutualFriendsCount: true,
        friendRequestsSentCount: true,
        status: true,
      },
    }),
    buildTopFailureAccounts(since, 10),
    prisma.friendAction.findMany({
      where: {
        status: "failed",
        ...periodFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { account: { select: { username: true } } },
    }),
    outreachWindow(since),
    prisma.accountGroup.count(),
    prisma.friendAction.findMany({
      where: {
        ...chartFilter,
      },
      select: { createdAt: true, status: true, errorMessage: true },
    }),
    prisma.job.findMany({
      where: {
        type: { in: ["ADD_FRIENDS", "SUBSCRIBE"] },
        status: "COMPLETED",
        ...(chartSince
          ? { completedAt: { gte: chartSince } }
          : { completedAt: { not: null } }),
        result: { not: null },
      },
      select: { type: true, completedAt: true, result: true },
    }),
  ]);

  for (const action of friendActionsChart) {
    const key = hourly ? hourKey(action.createdAt) : dayKey(action.createdAt);
    if (!daily[key]) continue;
    if (action.status === "failed") daily[key].failed += 1;
  }

  for (const job of outreachJobsChart) {
    if (!job.completedAt) continue;
    const key = hourly ? hourKey(job.completedAt) : dayKey(job.completedAt);
    if (!daily[key]) continue;
    try {
      const parsed = JSON.parse(job.result ?? "{}") as Record<string, unknown>;
      if (job.type === "ADD_FRIENDS" && Array.isArray(parsed.added)) {
        daily[key].friends += parsed.added.length;
      }
      if (job.type === "SUBSCRIBE" && Array.isArray(parsed.subscribed)) {
        daily[key].subscribes += parsed.subscribed.length;
      }
    } catch {
      // ignore malformed results
    }
  }

  const errorCounts = new Map<string, number>();
  for (const action of friendActionsChart) {
    if (action.status !== "failed" || !action.errorMessage) continue;
    const msg = action.errorMessage.replace(/^\[(friends|subscribe)\]\s*/i, "").slice(0, 120);
    errorCounts.set(msg, (errorCounts.get(msg) ?? 0) + 1);
  }
  const topErrors = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([message, count]) => ({ message, count }));

  const accountStatus = Object.fromEntries(
    accountByStatus.map((row) => [row.status, row._count._all])
  ) as Record<string, number>;

  return {
    range,
    generatedAt: new Date().toISOString(),
    accounts: {
      total: accountTotal,
      byStatus: accountStatus,
      active: accountStatus.ACTIVE ?? 0,
      emailVerified,
      inGroup: accountsInGroup,
      withoutGroup: accountTotal - accountsInGroup,
      mutualFriendsTotal: mutualFriendsSum._sum.mutualFriendsCount ?? 0,
      friendRequestsTotal: mutualFriendsSum._sum.friendRequestsSentCount ?? 0,
    },
    groups: { total: groupsCount },
    claims: Object.fromEntries(claimByStatus.map((r) => [r.status, r._count._all])),
    actions: Object.fromEntries(actionByStatus.map((r) => [r.status, r._count._all])),
    jobs: {
      byStatus: Object.fromEntries(jobByStatus.map((r) => [r.status, r._count._all])),
      byType: Object.fromEntries(jobByType.map((r) => [r.type, r._count._all])),
    },
    outreach: {
      period,
      chartGranularity: hourly ? ("hour" as const) : ("day" as const),
      daily: bucketKeys.map((date) => ({ date, ...daily[date] })),
      topAccounts: topByOutreach,
      topMutual: topByMutual,
      topFailures: topByFailures,
      recentFailures: recentFailedActions.map((a) => ({
        id: a.id,
        accountId: a.accountId,
        username: a.account.username,
        targetUser: a.targetUser,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt.toISOString(),
      })),
      topErrors,
    },
    batches: {
      total: batchesTotal,
      byStatus: Object.fromEntries(batchByStatus.map((r) => [r.status, r._count._all])),
      recent: recentBatches.map((b) => ({
        id: b.id,
        status: b.status,
        targetCount: b.targetCount,
        accountCount: b.accountCount,
        createdAt: b.createdAt.toISOString(),
        completedAt: b.completedAt?.toISOString() ?? null,
        summary: b.summaryJson ? safeJson(b.summaryJson) : null,
      })),
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function buildTopOutreachAccounts(since: Date | null, limit: number) {
  const jobs = await prisma.job.findMany({
    where: {
      type: { in: ["ADD_FRIENDS", "SUBSCRIBE"] },
      status: "COMPLETED",
      accountId: { not: null },
      ...(since ? { completedAt: { gte: since } } : {}),
      result: { not: null },
    },
    select: {
      accountId: true,
      type: true,
      result: true,
      account: { select: { username: true, status: true } },
    },
  });

  const map = new Map<
    string,
    { accountId: string; username: string; status: string; friends: number; follows: number }
  >();

  for (const job of jobs) {
    if (!job.accountId || !job.account) continue;
    const entry = map.get(job.accountId) ?? {
      accountId: job.accountId,
      username: job.account.username,
      status: job.account.status,
      friends: 0,
      follows: 0,
    };

    try {
      const parsed = JSON.parse(job.result ?? "{}") as Record<string, unknown>;
      if (job.type === "ADD_FRIENDS" && Array.isArray(parsed.added)) {
        entry.friends += parsed.added.length;
      }
      if (job.type === "SUBSCRIBE" && Array.isArray(parsed.subscribed)) {
        entry.follows += parsed.subscribed.length;
      }
    } catch {
      // ignore
    }

    map.set(job.accountId, entry);
  }

  if (!map.size && !since) {
    const claims = await prisma.friendTargetClaim.findMany({
      where: { status: { in: ["added", "subscribed"] } },
      select: {
        accountId: true,
        status: true,
        account: { select: { username: true, status: true } },
      },
    });

    for (const claim of claims) {
      const entry = map.get(claim.accountId) ?? {
        accountId: claim.accountId,
        username: claim.account.username,
        status: claim.account.status,
        friends: 0,
        follows: 0,
      };
      if (claim.status === "added") entry.friends += 1;
      if (claim.status === "subscribed") entry.follows += 1;
      map.set(claim.accountId, entry);
    }
  }

  return [...map.values()]
    .map((row) => ({ ...row, total: row.friends + row.follows }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

async function buildTopFailureAccounts(since: Date | null, limit: number) {
  const rows = await prisma.friendAction.groupBy({
    by: ["accountId"],
    where: {
      status: "failed",
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { accountId: "desc" } },
    take: limit,
  });

  if (!rows.length) return [];

  const accounts = await prisma.account.findMany({
    where: { id: { in: rows.map((r) => r.accountId) } },
    select: { id: true, username: true, status: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));

  return rows.map((row) => ({
    accountId: row.accountId,
    username: byId.get(row.accountId)?.username ?? "—",
    status: byId.get(row.accountId)?.status ?? "IDLE",
    failures: row._count._all,
  }));
}