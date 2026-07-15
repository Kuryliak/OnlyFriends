import { prisma } from "@/lib/db";
import { isAccountEligibleForJob } from "@/lib/automation/ban-security";

/** Cancel pending jobs for banned/errored accounts so workers don't spin on them. */
export async function cancelIneligiblePendingJobs(): Promise<number> {
  const pending = await prisma.job.findMany({
    where: { status: "PENDING" },
    include: {
      account: { select: { id: true, status: true, cookies: true } },
    },
    take: 200,
  });

  let cancelled = 0;
  for (const job of pending) {
    if (!job.account) continue;
    const reason = isAccountEligibleForJob(job.account, job);
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