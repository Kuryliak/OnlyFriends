import { randomBetween } from "@/lib/automation/human-behavior";
import {
  atomicClaimJob,
  getRunningSnapshot,
  pickNextClaimableJob,
  trackClaimedJob,
  type RunningSnapshot,
} from "@/lib/jobs/claim";
import { cancelIneligiblePendingJobs } from "@/lib/jobs/job-guards";
import { processJob, recoverStaleJobs } from "@/lib/jobs/processor";
import {
  getWorkerConfig,
  refreshWorkerConfig,
  workerConfigSummary,
} from "@/lib/jobs/worker-config";
import { queueIdleWarmupJobs } from "@/lib/jobs/idle-warmup";
import { touchWorkerHeartbeat } from "@/lib/workers/heartbeat";

let cycleRunning = false;
let cycleQueued = false;

function staggerDelay(): Promise<void> {
  const ms = getWorkerConfig().startStaggerMs;
  if (ms <= 0) return Promise.resolve();
  const jitter = randomBetween(0, Math.min(500, ms));
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

async function claimAndStart(
  state: RunningSnapshot,
  preferredJobId?: string,
  stagger = false
): Promise<boolean> {
  const next = await pickNextClaimableJob(state, preferredJobId);
  if (!next) return false;

  if (stagger) await staggerDelay();

  const claimed = await atomicClaimJob(next.id);
  if (!claimed) return false;

  trackClaimedJob(next, state);
  void runJobAndRefill(next.id);
  return true;
}

async function fillAvailableSlots(
  initial: RunningSnapshot,
  preferredJobId?: string
): Promise<void> {
  const state: RunningSnapshot = {
    totalRunning: initial.totalRunning,
    busyAccountIds: new Set(initial.busyAccountIds),
    proxyCounts: new Map(initial.proxyCounts),
    outreachRunning: initial.outreachRunning,
  };

  let started = 0;
  const maxNew = getWorkerConfig().concurrency - state.totalRunning;
  if (maxNew <= 0) return;

  for (let i = 0; i < maxNew; i++) {
    const prefer = i === 0 ? preferredJobId : undefined;
    const startedJob = await claimAndStart(state, prefer, i > 0);
    if (!startedJob) break;
    started += 1;
  }

  if (started > 0) {
    console.log(
      `[worker] Started ${started} job(s) — running ${state.totalRunning}/${getWorkerConfig().concurrency}`
    );
  }
}

async function runJobAndRefill(jobId: string): Promise<void> {
  try {
    await processJob(jobId);
  } catch (err) {
    console.error(`[worker] Job ${jobId} crashed:`, err);
  } finally {
    void runWorkerCycle();
  }
}

export async function runWorkerCycle(preferredJobId?: string): Promise<void> {
  if (cycleRunning) {
    cycleQueued = true;
    return;
  }

  cycleRunning = true;
  try {
    const config = await refreshWorkerConfig();
    await touchWorkerHeartbeat(workerConfigSummary(config));

    let preferred = preferredJobId;
    do {
      cycleQueued = false;
      await recoverStaleJobs();
      const cancelled = await cancelIneligiblePendingJobs();
      if (cancelled > 0) {
        console.log(`[worker] Cancelled ${cancelled} ineligible pending job(s)`);
      }
      const snapshot = await getRunningSnapshot();
      await fillAvailableSlots(snapshot, preferred);

      const afterFill = await getRunningSnapshot();
      const availableSlots = getWorkerConfig().concurrency - afterFill.totalRunning;
      if (availableSlots > 0) {
        const queuedWarmups = await queueIdleWarmupJobs(availableSlots);
        if (queuedWarmups > 0) {
          await fillAvailableSlots(await getRunningSnapshot(), preferred);
        }
      }

      preferred = undefined;
    } while (cycleQueued);
  } finally {
    cycleRunning = false;
  }
}