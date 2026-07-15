import { prisma } from "../src/lib/db";
import { syncAccountFriendStats } from "../src/lib/accounts/sync-friend-stats";

async function main() {
  const accounts = await prisma.account.findMany({
    where: { status: "ACTIVE", cookies: { not: null } },
    orderBy: { username: "asc" },
  });

  console.log(`[friend-stats] Syncing ${accounts.length} accounts...`);

  for (const account of accounts) {
    try {
      const stats = await syncAccountFriendStats(account.id);
      if (!stats) continue;
      console.log(
        `[friend-stats] ${account.username}: ${stats.mutualFriendsCount} added back, ${stats.friendRequestsSentCount} sent`
      );
    } catch (err) {
      console.log(
        `[friend-stats] ${account.username}: FAILED — ${err instanceof Error ? err.message : "error"}`
      );
    }
  }

  await prisma.$disconnect();
}

void main();