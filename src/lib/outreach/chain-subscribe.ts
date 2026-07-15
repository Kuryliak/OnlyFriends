import { prisma } from "@/lib/db";
import { normalizeTargetUsername } from "@/lib/friends/claims";
import { kickJobProcessor } from "@/lib/jobs/trigger";
import { appendJobToBatch, getBatchIdFromPayload } from "@/lib/outreach/batch";

export function targetsForChainedSubscribe(result: {
  added: string[];
  skipped?: string[];
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of [...result.added, ...(result.skipped ?? [])]) {
    const normalized = normalizeTargetUsername(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

export async function queueChainedSubscribeJob(
  accountId: string,
  targets: string[],
  parentJobId: string
) {
  if (!targets.length) return null;

  const parent = await prisma.job.findUnique({
    where: { id: parentJobId },
    select: { payload: true },
  });
  const batchId = parent ? getBatchIdFromPayload(parent.payload) : null;

  const job = await prisma.job.create({
    data: {
      type: "SUBSCRIBE",
      accountId,
      payload: JSON.stringify({
        targets,
        preDistributed: true,
        afterFriends: true,
        parentJobId,
        ...(batchId ? { batchId } : {}),
      }),
    },
  });

  if (batchId) {
    await appendJobToBatch(batchId, job.id);
  }

  kickJobProcessor(job.id);
  return job;
}