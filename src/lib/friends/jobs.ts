import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { createOutreachBatch } from "@/lib/outreach/batch";
import { distributeTargetsAcrossAccounts } from "./claims";

export async function createFriendJobs(
  accountId: string,
  targets: string[],
  options?: { chainSubscribe?: boolean }
) {
  let batchId: string | undefined;

  if (options?.chainSubscribe) {
    const batch = await createOutreachBatch({
      targetCount: targets.length,
      accountCount: 1,
      jobIds: [],
    });
    batchId = batch.id;
  }

  const job = await prisma.job.create({
    data: {
      type: "ADD_FRIENDS",
      accountId,
      payload: JSON.stringify({
        targets,
        ...(options?.chainSubscribe ? { chainSubscribe: true } : {}),
        ...(batchId ? { batchId } : {}),
      }),
    },
  });

  if (batchId) {
    await prisma.outreachBatch.update({
      where: { id: batchId },
      data: { jobIdsJson: JSON.stringify([job.id]) },
    });
  }

  kickJobProcessor(job.id);
  return { job, batchId };
}

export async function createDistributedFriendJobs(
  accountIds: string[],
  targets: string[],
  options?: { chainSubscribe?: boolean }
) {
  const distribution = await distributeTargetsAcrossAccounts(accountIds, targets);

  let batchId: string | undefined;

  if (options?.chainSubscribe) {
    const assignedCount = distribution.assignments.reduce(
      (sum, entry) => sum + entry.targets.length,
      0
    );
    const batch = await createOutreachBatch({
      targetCount: assignedCount,
      accountCount: distribution.jobs.length,
      jobIds: [],
    });
    batchId = batch.id;
  }

  const jobs = await Promise.all(
    distribution.jobs.map((entry) =>
      prisma.job.create({
        data: {
          type: "ADD_FRIENDS",
          accountId: entry.accountId,
          payload: JSON.stringify({
            targets: entry.targets,
            preDistributed: true,
            ...(options?.chainSubscribe ? { chainSubscribe: true } : {}),
            ...(batchId ? { batchId } : {}),
          }),
        },
      })
    )
  );

  if (batchId) {
    await prisma.outreachBatch.update({
      where: { id: batchId },
      data: { jobIdsJson: JSON.stringify(jobs.map((job) => job.id)) },
    });
  }

  if (jobs[0]) kickJobProcessor(jobs[0].id);

  return {
    jobs,
    batchId,
    skippedGlobal: distribution.skippedGlobal,
    assignments: distribution.assignments,
  };
}