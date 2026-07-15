import { prisma } from "@/lib/db";

const PERMANENT_STATUSES = ["added", "subscribed"] as const;
const RESERVED_STATUSES = ["claimed", ...PERMANENT_STATUSES] as const;

export function normalizeTargetUsername(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function dedupeTargets(targets: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of targets) {
    const normalized = normalizeTargetUsername(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

async function syncPermanentTargets(targets: string[]): Promise<void> {
  const normalized = dedupeTargets(targets);
  if (!normalized.length) return;

  await prisma.friendTargetClaim.deleteMany({ where: { status: "failed" } });

  const addedActions = await prisma.friendAction.findMany({
    where: { status: "added", targetUser: { in: normalized } },
    select: { targetUser: true, accountId: true },
    orderBy: { createdAt: "asc" },
  });

  for (const action of addedActions) {
    const targetUser = normalizeTargetUsername(action.targetUser);
    await upsertPermanentClaim(targetUser, action.accountId, "added");
  }

  const jobs = await prisma.job.findMany({
    where: {
      type: { in: ["ADD_FRIENDS", "SUBSCRIBE"] },
      status: "COMPLETED",
      accountId: { not: null },
    },
    select: { type: true, result: true, accountId: true },
  });

  const targetSet = new Set(normalized);

  for (const job of jobs) {
    if (!job.result || !job.accountId) continue;
    try {
      const parsed = JSON.parse(job.result) as {
        added?: string[];
        subscribed?: string[];
        skipped?: string[];
      };

      if (job.type === "ADD_FRIENDS" && Array.isArray(parsed.added)) {
        for (const user of parsed.added) {
          const targetUser = normalizeTargetUsername(user);
          if (targetSet.has(targetUser)) {
            await upsertPermanentClaim(targetUser, job.accountId, "added");
          }
        }
      }

      if (job.type === "SUBSCRIBE") {
        const successes = [
          ...(Array.isArray(parsed.subscribed) ? parsed.subscribed : []),
          ...(Array.isArray(parsed.skipped) ? parsed.skipped : []),
        ];
        for (const user of successes) {
          const targetUser = normalizeTargetUsername(user);
          if (targetSet.has(targetUser)) {
            await upsertPermanentClaim(targetUser, job.accountId, "subscribed");
          }
        }
      }
    } catch {
      // ignore malformed job results
    }
  }
}

async function upsertPermanentClaim(
  targetUser: string,
  accountId: string,
  status: (typeof PERMANENT_STATUSES)[number]
): Promise<void> {
  const existing = await prisma.friendTargetClaim.findUnique({
    where: { targetUser },
    select: { status: true, accountId: true },
  });

  if (
    existing &&
    PERMANENT_STATUSES.includes(existing.status as (typeof PERMANENT_STATUSES)[number])
  ) {
    return;
  }

  try {
    await prisma.friendTargetClaim.upsert({
      where: { targetUser },
      create: { targetUser, accountId, status },
      update: { status, accountId },
    });
  } catch {
    // race: another account claimed first
  }
}

/** Targets this account cannot use (owned by a different account). */
export async function getUnavailableTargets(
  targets: string[],
  forAccountId?: string
): Promise<Set<string>> {
  const normalized = dedupeTargets(targets);
  if (!normalized.length) return new Set();

  await syncPermanentTargets(normalized);

  const unavailable = new Set<string>();

  const claims = await prisma.friendTargetClaim.findMany({
    where: {
      targetUser: { in: normalized },
      status: { in: [...RESERVED_STATUSES] },
    },
    select: { targetUser: true, accountId: true },
  });
  for (const row of claims) {
    if (forAccountId && row.accountId === forAccountId) continue;
    unavailable.add(row.targetUser);
  }

  const addedActions = await prisma.friendAction.findMany({
    where: {
      targetUser: { in: normalized },
      status: "added",
    },
    select: { targetUser: true, accountId: true },
  });
  for (const row of addedActions) {
    if (forAccountId && row.accountId === forAccountId) continue;
    unavailable.add(normalizeTargetUsername(row.targetUser));
  }

  return unavailable;
}

/** Targets that cannot be assigned to anyone in this bombing batch. */
async function getBatchBlockedTargets(
  targets: string[],
  accountIds: string[]
): Promise<Set<string>> {
  const normalized = dedupeTargets(targets);
  if (!normalized.length) return new Set();

  const batch = new Set(accountIds);
  const blocked = new Set<string>();

  await syncPermanentTargets(normalized);

  const claims = await prisma.friendTargetClaim.findMany({
    where: {
      targetUser: { in: normalized },
      status: { in: [...RESERVED_STATUSES] },
    },
    select: { targetUser: true, accountId: true, status: true },
  });

  for (const row of claims) {
    if (
      PERMANENT_STATUSES.includes(row.status as (typeof PERMANENT_STATUSES)[number])
    ) {
      blocked.add(row.targetUser);
      continue;
    }
    if (!batch.has(row.accountId)) {
      blocked.add(row.targetUser);
    }
  }

  const addedActions = await prisma.friendAction.findMany({
    where: { targetUser: { in: normalized }, status: "added" },
    select: { targetUser: true, accountId: true },
  });
  for (const row of addedActions) {
    if (!batch.has(row.accountId)) {
      blocked.add(normalizeTargetUsername(row.targetUser));
    }
  }

  return blocked;
}

async function ensureTargetClaim(
  accountId: string,
  targetUser: string,
  jobId?: string
): Promise<boolean> {
  const existing = await prisma.friendTargetClaim.findUnique({
    where: { targetUser },
    select: { accountId: true },
  });

  if (existing) {
    return existing.accountId === accountId;
  }

  try {
    await prisma.friendTargetClaim.create({
      data: {
        targetUser,
        accountId,
        jobId,
        status: "claimed",
      },
    });
    return true;
  } catch {
    const again = await prisma.friendTargetClaim.findUnique({
      where: { targetUser },
      select: { accountId: true },
    });
    return again?.accountId === accountId;
  }
}

export type ClaimResult = {
  toSend: string[];
  skipped: string[];
};

export async function claimTargetsForAccount(
  accountId: string,
  jobId: string,
  targets: string[]
): Promise<ClaimResult> {
  const normalized = dedupeTargets(targets);
  const unavailable = await getUnavailableTargets(normalized, accountId);
  const toSend: string[] = [];
  const skipped: string[] = [];

  for (const targetUser of normalized) {
    if (unavailable.has(targetUser)) {
      skipped.push(targetUser);
      continue;
    }

    const claimed = await ensureTargetClaim(accountId, targetUser, jobId);
    if (claimed) {
      toSend.push(targetUser);
    } else {
      skipped.push(targetUser);
    }
  }

  return { toSend, skipped };
}

export async function markClaimAdded(
  accountId: string,
  targetUser: string
): Promise<void> {
  const normalized = normalizeTargetUsername(targetUser);
  await upsertPermanentClaim(normalized, accountId, "added");
}

export async function markClaimFailed(
  accountId: string,
  targetUser: string
): Promise<void> {
  const normalized = normalizeTargetUsername(targetUser);
  await prisma.friendTargetClaim.deleteMany({
    where: { targetUser: normalized, accountId, status: "claimed" },
  });
}

export async function markClaimSubscribed(
  accountId: string,
  targetUser: string
): Promise<void> {
  const normalized = normalizeTargetUsername(targetUser);
  await upsertPermanentClaim(normalized, accountId, "subscribed");
}

export type AccountAssignment = {
  accountId: string;
  targets: string[];
};

export type DistributeResult = {
  assignments: AccountAssignment[];
  skippedGlobal: string[];
  jobs: Array<{ accountId: string; targets: string[] }>;
};

export async function distributeTargetsAcrossAccounts(
  accountIds: string[],
  targets: string[]
): Promise<DistributeResult> {
  if (!accountIds.length) {
    return { assignments: [], skippedGlobal: [], jobs: [] };
  }

  const normalized = dedupeTargets(targets);
  const blocked = await getBatchBlockedTargets(normalized, accountIds);
  const available = normalized.filter((t) => !blocked.has(t));
  const skippedGlobal = normalized.filter((t) => blocked.has(t));

  const buckets: AccountAssignment[] = accountIds.map((accountId) => ({
    accountId,
    targets: [],
  }));

  available.forEach((target, index) => {
    buckets[index % accountIds.length].targets.push(target);
  });

  const claimedAssignments: AccountAssignment[] = [];

  for (const bucket of buckets) {
    const claimed: string[] = [];
    for (const targetUser of bucket.targets) {
      const ok = await ensureTargetClaim(bucket.accountId, targetUser);
      if (ok) {
        claimed.push(targetUser);
      } else {
        skippedGlobal.push(targetUser);
      }
    }
    if (claimed.length) {
      claimedAssignments.push({ accountId: bucket.accountId, targets: claimed });
    }
  }

  return {
    assignments: claimedAssignments,
    skippedGlobal: dedupeTargets(skippedGlobal),
    jobs: claimedAssignments.filter((a) => a.targets.length > 0),
  };
}