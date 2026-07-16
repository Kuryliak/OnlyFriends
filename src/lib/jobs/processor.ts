import { prisma } from "@/lib/db";
import { registerAccount } from "@/lib/automation/tasks/register";
import { verifyAccountEmail } from "@/lib/automation/tasks/verify-email";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { updateProfile } from "@/lib/automation/tasks/profile";
import { mergeAccountCookies } from "@/lib/automation/cookies";
import { addFriends } from "@/lib/automation/tasks/friends";
import {
  claimTargetsForAccount,
  markClaimAdded,
  markClaimFailed,
  markClaimSubscribed,
  normalizeTargetUsername,
} from "@/lib/friends/claims";
import { subscribeToProfiles } from "@/lib/automation/tasks/subscribe";
import { warmupScroll } from "@/lib/automation/tasks/warmup";
import { accountStatusAfterJobFailure } from "@/lib/jobs/job-failure-account-status";
import { resolveAccountProfileSlug } from "@/lib/automation/resolve-profile-slug";
import { syncAccountFriendStats } from "@/lib/accounts/sync-friend-stats";
import { sendChatMessage } from "@/lib/automation/tasks/message";
import {
  assertOutreachHourlyCap,
  isAccountEligibleForJob,
  isOutreachJob,
  waitSubscribeStagger,
} from "@/lib/automation/ban-security";
import { resolveAccountProxy } from "@/lib/proxy/resolve";
import {
  queueChainedSubscribeJob,
  targetsForChainedSubscribe,
} from "@/lib/outreach/chain-subscribe";
import { touchOutreachBatchForJob } from "@/lib/outreach/batch";
import { getWorkerConfig } from "@/lib/jobs/worker-config";
import { applyFriendsResultCooldown } from "@/lib/accounts/cooldown";

async function getAccountWithProxy(accountId: string) {
  return prisma.account.findUnique({
    where: { id: accountId },
    include: { proxy: true },
  });
}

async function preflightAccountJob(
  account: NonNullable<Awaited<ReturnType<typeof getAccountWithProxy>>>,
  job: { type: import("@prisma/client").JobType; status: import("@prisma/client").JobStatus }
): Promise<void> {
  const ineligible = isAccountEligibleForJob(account, job);
  if (ineligible) throw new Error(ineligible);

  if (isOutreachJob(job.type)) {
    resolveAccountProxy(account, job.type);
    await assertOutreachHourlyCap(account.id);
    if (job.type === "SUBSCRIBE") {
      await waitSubscribeStagger(account.id);
    }
  }
}

export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "RUNNING") return;

  try {
    const payload = JSON.parse(job.payload || "{}");

    if (job.accountId) {
      const account = await getAccountWithProxy(job.accountId);
      if (!account) throw new Error("Account not found");
      await preflightAccountJob(account, job);
    }

    switch (job.type) {
      case "REGISTER": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const result = await registerAccount(account, account.proxy);
        if (result.success) {
          const profileSlug = await resolveAccountProfileSlug(
            { ...account, cookies: result.cookies },
            account.proxy
          );
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: result.cookies,
              sex: "Woman",
              status: "ACTIVE",
              lastActive: new Date(),
              ...(profileSlug ? { profileSlug } : {}),
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify({ registered: true }),
              completedAt: new Date(),
              progress: 100,
            },
          });

          if (account.emailPassword) {
            const verifyJob = await prisma.job.create({
              data: {
                type: "VERIFY_EMAIL",
                accountId: account.id,
                payload: "{}",
              },
            });
            kickJobProcessor(verifyJob.id);
          }
        } else if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "PAUSED_CAPTCHA",
              errorMessage: result.error,
            },
          });
        } else {
          throw new Error(result.error);
        }
        break;
      }

      case "VERIFY_EMAIL": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const result = await verifyAccountEmail(account, account.proxy);
        if (result.success) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: result.cookies,
              emailVerified: true,
              status: "ACTIVE",
              lastActive: new Date(),
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify({
                verified: true,
                alreadyVerified: result.alreadyVerified ?? false,
              }),
              completedAt: new Date(),
              progress: 100,
            },
          });
        } else {
          throw new Error(result.error);
        }
        break;
      }

      case "SEND_MESSAGE": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const targetUser = String(payload.targetUser ?? "").trim();
        const message = String(payload.message ?? "").trim();
        if (!targetUser) throw new Error("Missing target user");
        if (!message) throw new Error("Missing message");

        const normalizedTarget = targetUser.replace(/^@+/, "").toLowerCase();

        const result = await sendChatMessage(account, account.proxy, normalizedTarget, message);
        if (result.success) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: result.cookies,
              status: "ACTIVE",
              lastActive: new Date(),
            },
          });
          await prisma.friendMessage.upsert({
            where: {
              accountId_targetUser: {
                accountId: account.id,
                targetUser: normalizedTarget,
              },
            },
            create: {
              accountId: account.id,
              targetUser: normalizedTarget,
              message,
              status: "sent",
              sentAt: new Date(),
            },
            update: {
              message,
              status: "sent",
              errorMessage: null,
              sentAt: new Date(),
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify({ targetUser: normalizedTarget, sent: true }),
              completedAt: new Date(),
              progress: 100,
            },
          });
        } else if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.friendMessage.upsert({
            where: {
              accountId_targetUser: {
                accountId: account.id,
                targetUser: normalizedTarget,
              },
            },
            create: {
              accountId: account.id,
              targetUser: normalizedTarget,
              message,
              status: "failed",
              errorMessage: result.error,
            },
            update: {
              message,
              status: "failed",
              errorMessage: result.error,
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "PAUSED_CAPTCHA",
              errorMessage: result.error,
            },
          });
        } else {
          await prisma.friendMessage.upsert({
            where: {
              accountId_targetUser: {
                accountId: account.id,
                targetUser: normalizedTarget,
              },
            },
            create: {
              accountId: account.id,
              targetUser: normalizedTarget,
              message,
              status: "failed",
              errorMessage: result.error,
            },
            update: {
              message,
              status: "failed",
              errorMessage: result.error,
            },
          });
          throw new Error(result.error);
        }
        break;
      }

      case "UPDATE_PROFILE": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const result = await updateProfile(account, account.proxy, payload);
        if (result.success) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: result.cookies,
              username: payload.username ?? account.username,
              displayName: payload.displayName ?? account.displayName,
              bio: payload.bio ?? account.bio,
              avatarPath: payload.avatarPath ?? account.avatarPath,
              sex: payload.sex ?? account.sex ?? "Woman",
              status: "ACTIVE",
              lastActive: new Date(),
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: { status: "COMPLETED", completedAt: new Date(), progress: 100 },
          });
        } else if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: { status: "PAUSED_CAPTCHA", errorMessage: result.error },
          });
        } else {
          throw new Error(result.error);
        }
        break;
      }

      case "ADD_FRIENDS": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const targets: string[] = payload.targets ?? [];
        let toSend = targets;
        let skipped: string[] = [];

        if (!payload.preDistributed) {
          const claim = await claimTargetsForAccount(account.id, jobId, targets);
          toSend = claim.toSend;
          skipped = claim.skipped;
        }

        const result = await addFriends(account, account.proxy, toSend);
        const enriched = {
          ...result,
          skipped: [...skipped, ...(result.skipped ?? [])],
        };

        if (result.cookies) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: mergeAccountCookies(account.cookies, result.cookies),
              lastActive: new Date(),
            },
          });
        }

        for (const user of result.added) {
          const targetUser = normalizeTargetUsername(user);
          await markClaimAdded(account.id, targetUser);
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser,
              status: "added",
              errorMessage: "[friends]",
            },
          });
        }
        for (const user of result.skipped ?? []) {
          const targetUser = normalizeTargetUsername(user);
          await markClaimAdded(account.id, targetUser);
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser,
              status: "added",
              errorMessage: "[friends] Already friends or request pending",
            },
          });
        }
        for (const f of result.failed) {
          if (f.user === "*") continue;
          const targetUser = normalizeTargetUsername(f.user);
          await markClaimFailed(account.id, targetUser);
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser,
              status: "failed",
              errorMessage: `[friends] ${f.error}`,
            },
          });
        }
        for (const user of skipped) {
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser: user,
              status: "skipped",
              errorMessage: "[friends] Already added or assigned to another account",
            },
          });
        }

        if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "PAUSED_CAPTCHA",
              result: JSON.stringify(enriched),
              errorMessage: "Captcha — open Jobs, click Resume, solve in the browser window",
            },
          });
        } else {
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify(enriched),
              completedAt: new Date(),
              progress: 100,
            },
          });
          try {
            await applyFriendsResultCooldown(account.id, {
              added: result.added,
              skipped: result.skipped,
              failed: result.failed,
              accountLimit: result.accountLimit,
            });
          } catch {
            // Non-fatal
          }
          try {
            await syncAccountFriendStats(account.id);
          } catch {
            // Non-fatal; stats refresh on next profile view.
          }

          // Opt-in only — default is friends-only for max traffic
          if (payload.chainSubscribe === true) {
            const subscribeTargets = targetsForChainedSubscribe({
              added: result.added,
              skipped: result.skipped,
            });
            await queueChainedSubscribeJob(account.id, subscribeTargets, jobId);
          }
        }
        break;
      }

      case "SUBSCRIBE": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const targets: string[] = payload.targets ?? [];
        let toSend = targets;
        let claimSkipped: string[] = [];

        if (!payload.preDistributed) {
          const claim = await claimTargetsForAccount(account.id, jobId, targets);
          toSend = claim.toSend;
          claimSkipped = claim.skipped;
        }

        const result = await subscribeToProfiles(account, account.proxy, toSend);
        const enriched = {
          ...result,
          skipped: [...claimSkipped, ...result.skipped],
        };

        if (result.cookies) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: mergeAccountCookies(account.cookies, result.cookies),
              lastActive: new Date(),
            },
          });
        }

        for (const user of result.subscribed) {
          await markClaimSubscribed(account.id, normalizeTargetUsername(user));
        }
        for (const user of result.skipped) {
          await markClaimSubscribed(account.id, normalizeTargetUsername(user));
        }
        for (const f of result.failed) {
          if (f.user === "*") continue;
          const targetUser = normalizeTargetUsername(f.user);
          await markClaimFailed(account.id, targetUser);
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser,
              status: "failed",
              errorMessage: `[subscribe] ${f.error}`,
            },
          });
        }
        for (const user of claimSkipped) {
          await prisma.friendAction.create({
            data: {
              accountId: account.id,
              targetUser: user,
              status: "skipped",
              errorMessage: "[subscribe] Already added or assigned to another account",
            },
          });
        }

        if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "PAUSED_CAPTCHA",
              result: JSON.stringify(enriched),
              errorMessage: "Captcha during subscribe",
            },
          });
        } else {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "ACTIVE", lastActive: new Date() },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify(enriched),
              completedAt: new Date(),
              progress: 100,
            },
          });
        }
        break;
      }

      case "WARMUP_SCROLL": {
        const account = job.accountId
          ? await getAccountWithProxy(job.accountId)
          : null;
        if (!account) throw new Error("Account not found");

        const minutes = payload.durationMinutes ?? 5;
        const result = await warmupScroll(account, account.proxy, minutes);

        if (result.success) {
          await prisma.account.update({
            where: { id: account.id },
            data: {
              cookies: result.cookies,
              status: "ACTIVE",
              lastActive: new Date(),
            },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: {
              status: "COMPLETED",
              result: JSON.stringify({ pagesVisited: result.pagesVisited }),
              completedAt: new Date(),
              progress: 100,
            },
          });
        } else if (result.captcha) {
          await prisma.account.update({
            where: { id: account.id },
            data: { status: "CAPTCHA" },
          });
          await prisma.job.update({
            where: { id: jobId },
            data: { status: "PAUSED_CAPTCHA", errorMessage: result.error },
          });
        } else {
          throw new Error(result.error);
        }
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job failed";
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    // Config issues (missing proxy, inactive proxy) fail the job only —
    // do not paint the account ERROR when the session is still fine.
    if (job.accountId) {
      const nextStatus = accountStatusAfterJobFailure(err, message);
      if (nextStatus) {
        await prisma.account.update({
          where: { id: job.accountId },
          data: { status: nextStatus },
        });
      }
    }
  } finally {
    await touchOutreachBatchForJob(jobId);
  }
}

export async function recoverStaleJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - getWorkerConfig().staleJobMs);
  const stale = await prisma.job.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleBefore } },
    data: {
      status: "FAILED",
      errorMessage: "Job timed out (stale)",
      completedAt: new Date(),
    },
  });
  if (stale.count > 0) {
    console.warn(`[worker] Marked ${stale.count} stale job(s) as failed`);
  }
}

/** @deprecated Use runWorkerCycle from scheduler.ts */
export async function pollPendingJobs(): Promise<void> {
  const { runWorkerCycle } = await import("@/lib/jobs/scheduler");
  await runWorkerCycle();
}