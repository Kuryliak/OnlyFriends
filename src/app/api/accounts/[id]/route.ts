import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildOutreachIssues } from "@/lib/accounts/outreach-failures";
import { parseFriendSlugList } from "@/lib/accounts/xvideos-friend-stats";
import { syncAccountFriendStatsIfStale } from "@/lib/accounts/sync-friend-stats";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { emptyToUndefined } from "@/lib/api/sanitize";
import { z } from "zod";

const optionalEmail = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().email().optional()
);

const updateSchema = z.object({
  username: z.string().min(3).optional(),
  email: optionalEmail,
  password: z.string().min(6).optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  avatarPath: z.string().optional(),
  groupId: z.string().nullable().optional(),
  proxyId: z.string().nullable().optional(),
  status: z.enum(["IDLE", "ACTIVE", "CAPTCHA", "BANNED", "ERROR"]).optional(),
  syncProfile: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await syncAccountFriendStatsIfStale(id);

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      group: true,
      proxy: true,
      friends: { orderBy: { createdAt: "desc" } },
      friendClaims: { orderBy: { createdAt: "desc" } },
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          status: true,
          result: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const friendsAdded: Array<{
    targetUser: string;
    createdAt: Date;
    source: "claim" | "action";
  }> = account.friendClaims
    .filter((c) => c.status === "added")
    .map((c) => ({
      targetUser: c.targetUser,
      createdAt: c.createdAt,
      source: "claim" as const,
    }));

  const followsSent = account.friendClaims
    .filter((c) => c.status === "subscribed")
    .map((c) => ({
      targetUser: c.targetUser,
      createdAt: c.createdAt,
    }));

  const outreachIssues = buildOutreachIssues(account.friends, account.jobs);

  const addedUsernames = new Set(friendsAdded.map((f) => f.targetUser));
  for (const action of account.friends.filter((a) => a.status === "added")) {
    if (!addedUsernames.has(action.targetUser)) {
      friendsAdded.push({
        targetUser: action.targetUser,
        createdAt: action.createdAt,
        source: "action" as const,
      });
    }
  }
  friendsAdded.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const mutualFriends = parseFriendSlugList(account.mutualFriendsJson);
  const friendRequestsSent = parseFriendSlugList(account.friendRequestsSentJson);
  const syncedAt = account.friendStatsSyncedAt?.toISOString() ?? null;

  const { cookies: _cookies, friends: _friends, friendClaims: _claims, jobs, ...profile } =
    account;

  return NextResponse.json({
    ...profile,
    stats: {
      mutualFriends: account.mutualFriendsCount,
      friendRequestsSent: account.friendRequestsSentCount,
      friendsAdded: friendsAdded.length,
      followsSent: followsSent.length,
      friendsFailed: outreachIssues.filter((i) => i.status === "failed").length,
      friendsSkipped: outreachIssues.filter((i) => i.status === "skipped").length,
      inProgress: account.friendClaims.filter((c) => c.status === "claimed").length,
    },
    mutualFriends: mutualFriends.map((targetUser) => ({ targetUser, syncedAt })),
    friendRequestsSent: friendRequestsSent.map((targetUser) => ({ targetUser, syncedAt })),
    friendsAdded,
    followsSent,
    outreachIssues,
    recentJobs: jobs.map(({ result: _result, ...job }) => job),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(emptyToUndefined(body));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { syncProfile, ...rawData } = parsed.data;
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = {
    ...rawData,
    avatarPath: rawData.avatarPath ?? existing.avatarPath ?? undefined,
  };

  const account = await prisma.account.update({
    where: { id },
    data,
    include: { group: true, proxy: true },
  });

  if (syncProfile) {
    const payload = {
      displayName: data.displayName ?? existing.displayName ?? undefined,
      bio: data.bio ?? existing.bio ?? undefined,
      avatarPath: data.avatarPath ?? existing.avatarPath ?? undefined,
    };

    const job = await prisma.job.create({
      data: {
        type: "UPDATE_PROFILE",
        accountId: id,
        payload: JSON.stringify(payload),
      },
    });
    kickJobProcessor(job.id);
  }

  return NextResponse.json({ ...account, syncQueued: Boolean(syncProfile) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}