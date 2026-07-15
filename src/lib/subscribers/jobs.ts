import { prisma } from "@/lib/db";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { distributeTargetsAcrossAccounts } from "@/lib/friends/claims";

export async function createSubscribeJob(accountId: string, targets: string[]) {
  const job = await prisma.job.create({
    data: {
      type: "SUBSCRIBE",
      accountId,
      payload: JSON.stringify({ targets }),
    },
  });
  kickJobProcessor(job.id);
  return job;
}

export async function createDistributedSubscribeJobs(
  accountIds: string[],
  targets: string[]
) {
  const distribution = await distributeTargetsAcrossAccounts(accountIds, targets);

  const jobs = await Promise.all(
    distribution.jobs.map((entry) =>
      prisma.job.create({
        data: {
          type: "SUBSCRIBE",
          accountId: entry.accountId,
          payload: JSON.stringify({
            targets: entry.targets,
            preDistributed: true,
          }),
        },
      })
    )
  );

  if (jobs[0]) kickJobProcessor(jobs[0].id);

  return {
    jobs,
    skippedGlobal: distribution.skippedGlobal,
    assignments: distribution.assignments,
  };
}