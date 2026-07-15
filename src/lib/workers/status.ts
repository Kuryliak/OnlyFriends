import { prisma } from "@/lib/db";
import { getRunningSnapshot } from "@/lib/jobs/claim";
import { workerConfigSummary } from "@/lib/jobs/worker-config";
import {
  resolveWorkerSettings,
  WORKER_SETTINGS_BOUNDS,
  type WorkerSettings,
  type WorkerSettingsSources,
} from "@/lib/settings/worker-settings";
import { countAutoWarmupEligible } from "@/lib/jobs/idle-warmup";
import { resolveAutoWarmupSettings } from "@/lib/settings/auto-warmup";
import { AUTO_WARMUP_BOUNDS, type AutoWarmupSettings } from "@/lib/settings/auto-warmup-shared";
import { resolveStealthSettings } from "@/lib/settings/stealth";
import type { StealthSettings } from "@/lib/settings/stealth-shared";
import { listWorkerHeartbeats } from "@/lib/workers/heartbeat";

export type WorkerStatusPayload = {
  settings: WorkerSettings;
  sources: WorkerSettingsSources;
  bounds: typeof WORKER_SETTINGS_BOUNDS;
  summary: string;
  snapshot: {
    totalRunning: number;
    outreachRunning: number;
    busyAccounts: number;
    busyProxies: number;
    slotsAvailable: number;
    outreachSlotsAvailable: number;
  };
  queue: {
    pending: number;
    pausedCaptcha: number;
  };
  runningJobs: Array<{
    id: string;
    type: string;
    startedAt: string | null;
    accountUsername: string | null;
    proxyName: string | null;
  }>;
  workers: Array<{
    workerId: string;
    at: string;
    configSummary: string;
    online: boolean;
  }>;
  autoWarmup: {
    settings: AutoWarmupSettings;
    bounds: typeof AUTO_WARMUP_BOUNDS;
    eligibleNow: number;
  };
  stealth: {
    settings: StealthSettings;
    activeProxies: number;
    accountsWithoutProxy: number;
  };
};

export async function getWorkerStatusPayload(): Promise<WorkerStatusPayload> {
  const { settings, sources } = await resolveWorkerSettings();

  const [
    snapshot,
    pending,
    pausedCaptcha,
    runningJobs,
    heartbeats,
    autoWarmupSettings,
    eligibleNow,
    stealthSettings,
    activeProxies,
    accountsWithoutProxy,
  ] = await Promise.all([
    getRunningSnapshot(),
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.job.count({ where: { status: "PAUSED_CAPTCHA" } }),
    prisma.job.findMany({
      where: { status: "RUNNING" },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        type: true,
        startedAt: true,
        account: {
          select: {
            username: true,
            proxyId: true,
            proxy: { select: { name: true } },
          },
        },
      },
    }),
    listWorkerHeartbeats(settings.pollMs * 3 + 10_000),
    resolveAutoWarmupSettings(),
    countAutoWarmupEligible(),
    resolveStealthSettings(),
    prisma.proxy.count({ where: { isActive: true } }),
    prisma.account.count({ where: { proxyId: null } }),
  ]);

  const proxyIds = new Set<string>();
  for (const job of runningJobs) {
    if (job.account?.proxyId) proxyIds.add(job.account.proxyId);
  }

  return {
    settings,
    sources,
    bounds: WORKER_SETTINGS_BOUNDS,
    summary: workerConfigSummary(settings),
    snapshot: {
      totalRunning: snapshot.totalRunning,
      outreachRunning: snapshot.outreachRunning,
      busyAccounts: snapshot.busyAccountIds.size,
      busyProxies: proxyIds.size,
      slotsAvailable: Math.max(0, settings.concurrency - snapshot.totalRunning),
      outreachSlotsAvailable: Math.max(0, settings.outreachConcurrency - snapshot.outreachRunning),
    },
    queue: { pending, pausedCaptcha },
    runningJobs: runningJobs.map((job) => ({
      id: job.id,
      type: job.type,
      startedAt: job.startedAt?.toISOString() ?? null,
      accountUsername: job.account?.username ?? null,
      proxyName: job.account?.proxy?.name ?? null,
    })),
    workers: heartbeats.map((hb) => ({
      workerId: hb.workerId,
      at: hb.at,
      configSummary: hb.configSummary,
      online: true,
    })),
    autoWarmup: {
      settings: autoWarmupSettings,
      bounds: AUTO_WARMUP_BOUNDS,
      eligibleNow,
    },
    stealth: {
      settings: stealthSettings,
      activeProxies,
      accountsWithoutProxy,
    },
  };
}