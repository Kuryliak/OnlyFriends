import { prisma } from "@/lib/db";
import { effectiveBanSecurityConfig } from "@/lib/automation/ban-security";
import { isAccountInCooldown } from "@/lib/accounts/cooldown";
import { sumOutreachJobField } from "@/lib/stats/dashboard";

export type TrafficBlocker = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export type TrafficSnapshot = {
  /** Successful friend requests in the last 60 minutes. */
  friendsLastHour: number;
  /** Successful friend requests in the last 24 hours. */
  friendsLast24h: number;
  /** Rough friends/hour rate from last hour. */
  friendsPerHour: number;
  pendingFriendJobs: number;
  runningFriendJobs: number;
  activeAccounts: number;
  readyForOutreach: number;
  blockers: TrafficBlocker[];
};

export async function getTrafficSnapshot(): Promise<TrafficSnapshot> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();

  const [
    friendsLastHour,
    friendsLast24h,
    pendingFriendJobs,
    runningFriendJobs,
    captchaAccounts,
    bannedAccounts,
    errorAccounts,
    activeAccounts,
    activeNoProxy,
    activeNoCookies,
    cooldownAccounts,
    activeWithProxyCookies,
  ] = await Promise.all([
    sumOutreachJobField("ADD_FRIENDS", "added", hourAgo),
    sumOutreachJobField("ADD_FRIENDS", "added", dayAgo),
    prisma.job.count({ where: { type: "ADD_FRIENDS", status: "PENDING" } }),
    prisma.job.count({ where: { type: "ADD_FRIENDS", status: "RUNNING" } }),
    prisma.account.count({ where: { status: "CAPTCHA" } }),
    prisma.account.count({ where: { status: "BANNED" } }),
    prisma.account.count({ where: { status: "ERROR" } }),
    prisma.account.count({ where: { status: "ACTIVE" } }),
    prisma.account.count({
      where: { status: "ACTIVE", proxyId: null },
    }),
    prisma.account.count({
      where: {
        status: "ACTIVE",
        OR: [{ cookies: null }, { cookies: "" }],
      },
    }),
    prisma.account.count({
      where: {
        status: "ACTIVE",
        cooldownUntil: { gt: now },
      },
    }),
    prisma.account.findMany({
      where: {
        status: "ACTIVE",
        proxyId: { not: null },
        cookies: { not: null },
      },
      select: { id: true, cookies: true, cooldownUntil: true },
    }),
  ]);

  const readyForOutreach = activeWithProxyCookies.filter(
    (a) => a.cookies?.trim() && !isAccountInCooldown(a.cooldownUntil, now)
  ).length;

  const blockers: TrafficBlocker[] = [];
  if (captchaAccounts > 0) {
    blockers.push({
      key: "captcha",
      label: "Капча",
      count: captchaAccounts,
      href: "/captcha",
    });
  }
  if (errorAccounts > 0) {
    blockers.push({
      key: "error",
      label: "Ошибка",
      count: errorAccounts,
      href: "/accounts",
    });
  }
  if (bannedAccounts > 0) {
    blockers.push({
      key: "banned",
      label: "Бан",
      count: bannedAccounts,
      href: "/accounts",
    });
  }
  if (activeNoProxy > 0) {
    blockers.push({
      key: "noProxy",
      label: "Без прокси",
      count: activeNoProxy,
      href: "/proxies",
    });
  }
  if (activeNoCookies > 0) {
    blockers.push({
      key: "noSession",
      label: "Нет сессии",
      count: activeNoCookies,
      href: "/accounts",
    });
  }
  if (cooldownAccounts > 0) {
    blockers.push({
      key: "cooldown",
      label: "Пауза (лимит)",
      count: cooldownAccounts,
      href: "/accounts",
    });
  }

  // Cap pressure: rough — how many ACTIVE are ready but might be at hourly cap is expensive;
  // show pending friend queue as operational pressure.
  if (pendingFriendJobs > 0) {
    blockers.push({
      key: "queue",
      label: "В очереди friends",
      count: pendingFriendJobs,
      href: "/jobs",
    });
  }

  const cfg = effectiveBanSecurityConfig();
  const theoreticalCap =
    readyForOutreach * (cfg.outreachHourlyCapPerAccount || 40);

  return {
    friendsLastHour,
    friendsLast24h,
    friendsPerHour: friendsLastHour,
    pendingFriendJobs,
    runningFriendJobs,
    activeAccounts,
    readyForOutreach,
    blockers: blockers
      // keep queue last visually via sort: capacity issues first
      .sort((a, b) => {
        const order = ["captcha", "error", "banned", "noProxy", "noSession", "cooldown", "queue"];
        return order.indexOf(a.key) - order.indexOf(b.key);
      })
      .map((b) =>
        b.key === "queue" && theoreticalCap > 0
          ? {
              ...b,
              label: `${b.label} · потолок ~${theoreticalCap}/ч`,
            }
          : b
      ),
  };
}
