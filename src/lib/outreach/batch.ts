import type { Job, JobStatus, OutreachBatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type OutreachBatchSummary = {
  friendsAdded: number;
  friendsFailed: number;
  friendsSkipped: number;
  subscribed: number;
  subscribeFailed: number;
  subscribeSkipped: number;
  captchaJobs: number;
  failedJobs: number;
  completedJobs: number;
  totalJobs: number;
};

function parseJobIds(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function parseJobResult(result: string | null): Record<string, unknown> {
  if (!result) return {};
  try {
    const parsed = JSON.parse(result);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countFailedEntries(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => {
    if (entry && typeof entry === "object" && "user" in entry) {
      return (entry as { user?: string }).user !== "*";
    }
    return true;
  }).length;
}

export function aggregateOutreachSummary(jobs: Job[]): OutreachBatchSummary {
  const summary: OutreachBatchSummary = {
    friendsAdded: 0,
    friendsFailed: 0,
    friendsSkipped: 0,
    subscribed: 0,
    subscribeFailed: 0,
    subscribeSkipped: 0,
    captchaJobs: 0,
    failedJobs: 0,
    completedJobs: 0,
    totalJobs: jobs.length,
  };

  for (const job of jobs) {
    if (job.status === "COMPLETED") summary.completedJobs += 1;
    if (job.status === "FAILED" || job.status === "CANCELLED") summary.failedJobs += 1;
    if (job.status === "PAUSED_CAPTCHA") summary.captchaJobs += 1;

    const result = parseJobResult(job.result);
    if (job.type === "ADD_FRIENDS") {
      summary.friendsAdded += countArray(result.added);
      summary.friendsFailed += countFailedEntries(result.failed);
      summary.friendsSkipped += countArray(result.skipped);
    }
    if (job.type === "SUBSCRIBE") {
      summary.subscribed += countArray(result.subscribed);
      summary.subscribeFailed += countFailedEntries(result.failed);
      summary.subscribeSkipped += countArray(result.skipped);
    }
  }

  return summary;
}

function resolveBatchStatus(jobs: Job[]): OutreachBatchStatus {
  if (!jobs.length) return "FAILED";

  const statuses = new Set(jobs.map((job) => job.status));

  if (statuses.has("PENDING") || statuses.has("RUNNING")) return "RUNNING";
  if (statuses.has("PAUSED_CAPTCHA")) return "PAUSED_CAPTCHA";

  const terminal = jobs.filter(
    (job) => job.status !== "PENDING" && job.status !== "RUNNING"
  );
  const allFailed = terminal.every(
    (job) => job.status === "FAILED" || job.status === "CANCELLED"
  );
  if (allFailed) return "FAILED";

  const hasFailures = terminal.some(
    (job) => job.status === "FAILED" || job.status === "CANCELLED"
  );
  if (hasFailures) return "PARTIAL";

  return "COMPLETED";
}

export async function createOutreachBatch(params: {
  targetCount: number;
  accountCount: number;
  jobIds: string[];
}) {
  return prisma.outreachBatch.create({
    data: {
      targetCount: params.targetCount,
      accountCount: params.accountCount,
      jobIdsJson: JSON.stringify(params.jobIds),
    },
  });
}

export async function appendJobToBatch(batchId: string, jobId: string) {
  const batch = await prisma.outreachBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;

  const jobIds = parseJobIds(batch.jobIdsJson);
  if (jobIds.includes(jobId)) return;

  await prisma.outreachBatch.update({
    where: { id: batchId },
    data: {
      jobIdsJson: JSON.stringify([...jobIds, jobId]),
      status: "RUNNING",
      completedAt: null,
    },
  });
}

export function getBatchIdFromPayload(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload || "{}");
    return typeof parsed.batchId === "string" ? parsed.batchId : null;
  } catch {
    return null;
  }
}

export async function refreshOutreachBatch(batchId: string) {
  const batch = await prisma.outreachBatch.findUnique({ where: { id: batchId } });
  if (!batch) return null;

  const jobIds = parseJobIds(batch.jobIdsJson);
  if (!jobIds.length) {
    return prisma.outreachBatch.update({
      where: { id: batchId },
      data: {
        status: "FAILED",
        summaryJson: JSON.stringify(aggregateOutreachSummary([])),
        completedAt: new Date(),
      },
    });
  }

  const jobs = await prisma.job.findMany({ where: { id: { in: jobIds } } });
  const status = resolveBatchStatus(jobs);
  const summary = aggregateOutreachSummary(jobs);
  const isTerminal = status !== "RUNNING";

  return prisma.outreachBatch.update({
    where: { id: batchId },
    data: {
      status,
      summaryJson: JSON.stringify(summary),
      ...(isTerminal ? { completedAt: new Date() } : { completedAt: null }),
    },
  });
}

export async function touchOutreachBatchForJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { payload: true },
  });
  if (!job) return;

  const batchId = getBatchIdFromPayload(job.payload);
  if (!batchId) return;

  await refreshOutreachBatch(batchId);
}

export function isTerminalBatchStatus(status: OutreachBatchStatus): boolean {
  return status !== "RUNNING";
}