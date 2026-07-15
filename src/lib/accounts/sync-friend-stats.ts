import { prisma } from "@/lib/db";
import {
  fetchXvideosFriendStats,
  type XvideosFriendStats,
} from "@/lib/accounts/xvideos-friend-stats";

const STALE_MS = 10 * 60 * 1000;

export function friendStatsAreStale(syncedAt: Date | null | undefined): boolean {
  if (!syncedAt) return true;
  return Date.now() - syncedAt.getTime() > STALE_MS;
}

export async function syncAccountFriendStats(
  accountId: string
): Promise<XvideosFriendStats | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.cookies) return null;

  const stats = await fetchXvideosFriendStats(account.cookies, account.userAgent);

  await prisma.account.update({
    where: { id: accountId },
    data: {
      mutualFriendsCount: stats.mutualFriendsCount,
      friendRequestsSentCount: stats.friendRequestsSentCount,
      mutualFriendsJson: JSON.stringify(stats.mutualFriends),
      friendRequestsSentJson: JSON.stringify(stats.friendRequestsSent),
      friendStatsSyncedAt: new Date(),
    },
  });

  return stats;
}

export async function syncAccountFriendStatsIfStale(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { cookies: true, friendStatsSyncedAt: true, status: true },
  });

  if (!account?.cookies || account.status !== "ACTIVE") return;
  if (!friendStatsAreStale(account.friendStatsSyncedAt)) return;

  try {
    await syncAccountFriendStats(accountId);
  } catch {
    // Keep cached stats when XVIDEOS is unreachable.
  }
}