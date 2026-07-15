import type { JobType } from "@prisma/client";
import { readEnvWorkerSettings, resolveWorkerSettings } from "@/lib/settings/worker-settings";
import type { WorkerSettings } from "@/lib/settings/worker-settings-shared";

export const OUTREACH_JOB_TYPES: ReadonlySet<JobType> = new Set([
  "ADD_FRIENDS",
  "SUBSCRIBE",
  "SEND_MESSAGE",
]);

export type WorkerRuntimeConfig = WorkerSettings;

let cachedConfig: WorkerRuntimeConfig = readEnvWorkerSettings();

export function getWorkerConfig(): WorkerRuntimeConfig {
  return cachedConfig;
}

export async function refreshWorkerConfig(): Promise<WorkerRuntimeConfig> {
  const { settings } = await resolveWorkerSettings();
  cachedConfig = settings;
  return cachedConfig;
}

/** @deprecated Use getWorkerConfig() — kept for modules that read at import time */
export const workerConfig = new Proxy({} as WorkerRuntimeConfig, {
  get(_target, prop: keyof WorkerRuntimeConfig) {
    return cachedConfig[prop];
  },
});

export function workerConfigSummary(config: WorkerRuntimeConfig = cachedConfig): string {
  return [
    `concurrency=${config.concurrency}`,
    `proxy=${config.proxyConcurrency}`,
    `outreach=${config.outreachConcurrency}`,
    `stagger=${config.startStaggerMs}ms`,
  ].join(", ");
}