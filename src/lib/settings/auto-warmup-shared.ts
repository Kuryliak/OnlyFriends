export type AutoWarmupSettings = {
  enabled: boolean;
  intervalMinutes: number;
  durationMinutes: number;
  maxPerCycle: number;
};

export type AutoWarmupSettingsField = keyof AutoWarmupSettings;

export const AUTO_WARMUP_BOUNDS = {
  intervalMinutes: { min: 15, max: 24 * 60, default: 90, envKey: "AUTO_WARMUP_INTERVAL_MIN" },
  durationMinutes: { min: 1, max: 30, default: 3, envKey: "AUTO_WARMUP_DURATION_MIN" },
  maxPerCycle: { min: 1, max: 10, default: 2, envKey: "AUTO_WARMUP_MAX_PER_CYCLE" },
} as const;

export const AUTO_WARMUP_ENABLED_ENV = "AUTO_WARMUP_ENABLED";