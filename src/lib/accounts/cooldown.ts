import { prisma } from "@/lib/db";

/** Default pause after friend-request limit (hours). */
export function friendLimitCooldownHours(): number {
  const raw = process.env.FRIEND_LIMIT_COOLDOWN_HOURS;
  if (!raw) return 6;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 6;
  return Math.min(72, Math.max(1, n));
}

/** Short pause after a completely failed friends batch (hours). */
export function friendsFailCooldownHours(): number {
  const raw = process.env.FRIENDS_FAIL_COOLDOWN_HOURS;
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(24, Math.max(0, n));
}

export function isAccountInCooldown(cooldownUntil: Date | null | undefined, now = new Date()): boolean {
  if (!cooldownUntil) return false;
  return cooldownUntil.getTime() > now.getTime();
}

export function formatCooldownRemaining(cooldownUntil: Date, now = new Date()): string {
  const ms = Math.max(0, cooldownUntil.getTime() - now.getTime());
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} ч` : `${hours} ч ${rem} мин`;
}

export async function setAccountCooldown(
  accountId: string,
  hours: number,
  reason?: string
): Promise<Date | null> {
  if (hours <= 0) return null;
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.account.update({
    where: { id: accountId },
    data: { cooldownUntil: until },
  });
  if (reason) {
    console.log(`[cooldown] account ${accountId} until ${until.toISOString()} — ${reason}`);
  }
  return until;
}

export async function clearAccountCooldown(accountId: string): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: { cooldownUntil: null },
  });
}

/**
 * After ADD_FRIENDS result: put account on cooldown if hit daily/hourly friend limit
 * or the whole batch failed with zero success.
 */
export async function applyFriendsResultCooldown(
  accountId: string,
  result: {
    added: string[];
    skipped?: string[];
    failed: { user: string; error: string }[];
    accountLimit?: boolean;
  }
): Promise<void> {
  const limitHit =
    result.accountLimit === true ||
    result.failed.some(
      (f) =>
        /limit|code 11|friend-request limit|too many/i.test(f.error) ||
        f.error.includes("Skipped — account friend-request limit")
    );

  if (limitHit) {
    await setAccountCooldown(
      accountId,
      friendLimitCooldownHours(),
      "friend request limit"
    );
    return;
  }

  const successes = result.added.length + (result.skipped?.length ?? 0);
  const realFails = result.failed.filter((f) => f.user !== "*").length;
  if (successes === 0 && realFails >= 3) {
    const hours = friendsFailCooldownHours();
    if (hours > 0) {
      await setAccountCooldown(accountId, hours, "friends batch failed");
    }
  }
}
