import { prisma } from "@/lib/db";
import { isAccountEligibleForJob } from "@/lib/automation/ban-security";

/** Cancel pending jobs for banned/errored accounts so workers don't spin on them. */
export async function cancelIneligiblePendingJobs(): Promise<number> {
  const pending = await prisma.job.findMany({
    where: { status: "PENDING" },
    include: {
      account: {
        select: { id: true, status: true, cookies: true, cooldownUntil: true },
      },
    },
    take: 200,
  });

  let cancelled = 0;
  for (const job of pending) {
    if (!job.account) continue;
    // Do not cancel jobs only because of temporary cooldown — claim skips them until then
    const reason = isAccountEligibleForJob(job.account, job, { respectCooldown: false });
    if (!reason) continue;

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "CANCELLED",
        errorMessage: reason,
        completedAt: new Date(),
      },
    });
    cancelled += 1;
  }

  return cancelled;
}