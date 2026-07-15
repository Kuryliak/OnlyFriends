export type WorkerSettings = {
  concurrency: number;
  proxyConcurrency: number;
  outreachConcurrency: number;
  pollMs: number;
  startStaggerMs: number;
  staleJobMs: number;
};

export type WorkerSettingsField = keyof WorkerSettings;

export type WorkerSettingsSources = Record<WorkerSettingsField, "db" | "env" | "default">;

export const WORKER_SETTINGS_BOUNDS: Record<
  WorkerSettingsField,
  { min: number; max: number; default: number; envKey: string }
> = {
  concurrency: { min: 1, max: 16, default: 4, envKey: "WORKER_CONCURRENCY" },
  proxyConcurrency: { min: 1, max: 4, default: 1, envKey: "WORKER_PROXY_CONCURRENCY" },
  outreachConcurrency: { min: 1, max: 8, default: 2, envKey: "WORKER_OUTREACH_CONCURRENCY" },
  pollMs: { min: 500, max: 60_000, default: 3000, envKey: "WORKER_POLL_MS" },
  startStaggerMs: { min: 0, max: 10_000, default: 1000, envKey: "WORKER_START_STAGGER_MS" },
  staleJobMs: { min: 60_000, max: 3_600_000, default: 900_000, envKey: "WORKER_STALE_JOB_MS" },
};

export type WorkerSettingsPreset = {
  id: string;
  labelKey: string;
  values: WorkerSettings;
};

export const WORKER_SETTINGS_PRESETS: WorkerSettingsPreset[] = [
  {
    id: "conservative",
    labelKey: "workers.presetConservative",
    values: {
      concurrency: 2,
      proxyConcurrency: 1,
      outreachConcurrency: 2,
      pollMs: 3000,
      startStaggerMs: 1500,
      staleJobMs: 900_000,
    },
  },
  {
    id: "balanced",
    labelKey: "workers.presetBalanced",
    values: {
      concurrency: 4,
      proxyConcurrency: 1,
      outreachConcurrency: 2,
      pollMs: 3000,
      startStaggerMs: 1000,
      staleJobMs: 900_000,
    },
  },
  {
    id: "fiveAgents",
    labelKey: "workers.presetFiveAgents",
    values: {
      concurrency: 5,
      proxyConcurrency: 1,
      outreachConcurrency: 5,
      pollMs: 2000,
      startStaggerMs: 500,
      staleJobMs: 900_000,
    },
  },
  {
    id: "aggressive",
    labelKey: "workers.presetAggressive",
    values: {
      concurrency: 8,
      proxyConcurrency: 2,
      outreachConcurrency: 6,
      pollMs: 2000,
      startStaggerMs: 300,
      staleJobMs: 900_000,
    },
  },
];