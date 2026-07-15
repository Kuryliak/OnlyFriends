import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  countFriendActions24h,
  countNewTargets24h,
  countOutreachAccountsOnProxy24h,
  since24h,
  sumOutreachJobField,
} from "@/lib/stats/dashboard";

export async function GET() {
  const since = since24h();

  const [
    accounts,
    activeProxies,
    accountsOnProxy,
    accountsWithoutProxy,
    jobs,
    captchaAccounts,
    bannedAccounts,
    activeAccounts,
    friendsAddedAll,
    followsSentAll,
    uniqueTargetsAll,
    friendsFailedAll,
    friendsSkippedAll,
    friendsSent24h,
    friendsFailed24h,
    friendsSkipped24h,
    subscribesSent24h,
    subscribesFailed24h,
    uniqueTargets24h,
    outreachOnProxy24h,
  ] = await Promise.all([
    prisma.account.count(),
    prisma.proxy.count({ where: { isActive: true } }),
    prisma.account.count({ where: { proxyId: { not: null } } }),
    prisma.account.count({ where: { proxyId: null } }),
    prisma.job.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.account.count({ where: { status: "CAPTCHA" } }),
    prisma.account.count({ where: { status: "BANNED" } }),
    prisma.account.count({ where: { status: "ACTIVE" } }),
    prisma.friendTargetClaim.count({ where: { status: "added" } }),
    prisma.friendTargetClaim.count({ where: { status: "subscribed" } }),
    prisma.friendTargetClaim.count({
      where: { status: { in: ["added", "subscribed"] } },
    }),
    prisma.friendAction.count({ where: { status: "failed" } }),
    prisma.friendAction.count({ where: { status: "skipped" } }),
    sumOutreachJobField("ADD_FRIENDS", "added", since),
    countFriendActions24h(since, { status: "failed" }),
    countFriendActions24h(since, { status: "skipped" }),
    sumOutreachJobField("SUBSCRIBE", "subscribed", since),
    countFriendActions24h(since, { status: "failed", friendsOnly: false }),
    countNewTargets24h(since),
    countOutreachAccountsOnProxy24h(since),
  ]);

  const recentJobs = await prisma.job.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { account: { select: { username: true } } },
  });

  const claims = await prisma.friendTargetClaim.findMany({
    where: { status: { in: ["added", "subscribed"] } },
    select: {
      accountId: true,
      status: true,
      account: { select: { username: true } },
    },
  });

  const outreachMap = new Map<
    string,
    { accountId: string; username: string; friends: number; follows: number }
  >();

  for (const claim of claims) {
    const entry = outreachMap.get(claim.accountId) ?? {
      accountId: claim.accountId,
      username: claim.account.username,
      friends: 0,
      follows: 0,
    };
    if (claim.status === "added") entry.friends++;
    if (claim.status === "subscribed") entry.follows++;
    outreachMap.set(claim.accountId, entry);
  }

  const topAccounts = [...outreachMap.values()]
    .map((row) => ({
      ...row,
      total: row.friends + row.follows,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return NextResponse.json({
    accounts,
    activeAccounts,
    activeJobs: jobs,
    captchaAccounts,
    bannedAccounts,
    proxies: {
      active: activeProxies,
      accountsOnProxy,
      accountsWithoutProxy,
      outreachAccounts24h: outreachOnProxy24h,
    },
    last24h: {
      friendsSent: friendsSent24h,
      friendsFailed: friendsFailed24h,
      friendsSkipped: friendsSkipped24h,
      subscribesSent: subscribesSent24h,
      subscribesFailed: subscribesFailed24h,
      uniqueTargets: uniqueTargets24h,
    },
    outreach: {
      friendsAdded: friendsAddedAll,
      followsSent: followsSentAll,
      uniqueTargets: uniqueTargetsAll,
      friendsFailed: friendsFailedAll,
      friendsSkipped: friendsSkippedAll,
      topAccounts,
    },
    recentJobs,
  });
}