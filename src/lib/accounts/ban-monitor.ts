import { prisma } from "@/lib/db";
import { checkAccountHealth } from "@/lib/automation/check-account-health";

export type BanMonitorReport = {
  checkedAt: string;
  accounts: Array<{
    username: string;
    status: string;
    banned: boolean;
    healthy: boolean;
    reason?: string;
  }>;
  newlyBanned: string[];
};

export async function runBanMonitor(): Promise<BanMonitorReport> {
  const accounts = await prisma.account.findMany({
    include: { proxy: true },
    orderBy: { username: "asc" },
  });

  const newlyBanned: string[] = [];
  const results = [];

  for (const account of accounts) {
    const health = await checkAccountHealth(account, account.proxy);

    if (health.banned && account.status !== "BANNED") {
      await prisma.account.update({
        where: { id: account.id },
        data: { status: "BANNED" },
      });
      newlyBanned.push(account.username);
    }

    results.push({
      username: account.username,
      status: health.banned ? "BANNED" : account.status,
      banned: health.banned,
      healthy: health.healthy,
      reason: health.reason,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    accounts: results,
    newlyBanned,
  };
}