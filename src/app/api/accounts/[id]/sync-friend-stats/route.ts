import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncAccountFriendStats } from "@/lib/accounts/sync-friend-stats";
import { parseFriendSlugList } from "@/lib/accounts/xvideos-friend-stats";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    select: { id: true, cookies: true, status: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!account.cookies || account.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Account must be active with a saved session" },
      { status: 400 }
    );
  }

  try {
    const stats = await syncAccountFriendStats(id);
    if (!stats) {
      return NextResponse.json({ error: "Could not sync friend stats" }, { status: 400 });
    }

    const syncedAt = new Date().toISOString();
    return NextResponse.json({
      stats: {
        mutualFriends: stats.mutualFriendsCount,
        friendRequestsSent: stats.friendRequestsSentCount,
      },
      mutualFriends: stats.mutualFriends.map((targetUser) => ({ targetUser, syncedAt })),
      friendRequestsSent: stats.friendRequestsSent.map((targetUser) => ({ targetUser, syncedAt })),
      syncedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sync friend stats" },
      { status: 502 }
    );
  }
}