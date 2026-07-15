import { prisma } from "@/lib/db";
import {
  WORKER_SETTINGS_BOUNDS,
  type WorkerSettings,
  type WorkerSettingsField,
  type WorkerSettingsSources,
} from "@/lib/settings/worker-settings-shared";

export const WORKER_SETTINGS_KEY = "worker_settings";

export type { WorkerSettings, WorkerSettingsField, WorkerSettingsSources };
export { WORKER_SETTINGS_BOUNDS, WORKER_SETTINGS_PRESETS } from "@/lib/settings/worker-settings-shared";

function readEnvInt(name: string, fallback: number, min: number, max: number): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function clampField(field: WorkerSettingsField, value: number): number {
  const { min, max } = WORKER_SETTINGS_BOUNDS[field];
  return Math.min(max, Math.max(min, value));
}

export function readEnvWorkerSettings(): WorkerSettings {
  const result = {} as WorkerSettings;
  for (const field of Object.keys(WORKER_SETTINGS_BOUNDS) as WorkerSettingsField[]) {
    const bounds = WORKER_SETTINGS_BOUNDS[field];
    result[field] = readEnvInt(bounds.envKey, bounds.default, bounds.min, bounds.max) ?? bounds.default;
  }
  return result;
}

export function normalizeWorkerSettings(input: Partial<WorkerSettings>): WorkerSettings {
  const env = readEnvWorkerSettings();
  const result = { ...env };
  for (const field of Object.keys(WORKER_SETTINGS_BOUNDS) as WorkerSettingsField[]) {
    const raw = input[field];
    if (raw === undefined || raw === null) continue;
    const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(parsed)) continue;
    result[field] = clampField(field, parsed);
  }
  return result;
}

export async function getStoredWorkerSettings(): Promise<Partial<WorkerSettings> | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: WORKER_SETTINGS_KEY } });
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<WorkerSettings>;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export async function setWorkerSettings(input: Partial<WorkerSettings>): Promise<WorkerSettings> {
  const normalized = normalizeWorkerSettings(input);
  await prisma.appSetting.upsert({
    where: { key: WORKER_SETTINGS_KEY },
    create: { key: WORKER_SETTINGS_KEY, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  });
  return normalized;
}

export async function resolveWorkerSettings(): Promise<{
  settings: WorkerSettings;
  sources: WorkerSettingsSources;
}> {
  const stored = await getStoredWorkerSettings();
  const settings = normalizeWorkerSettings(stored ?? {});
  const sources = {} as WorkerSettingsSources;

  for (const field of Object.keys(WORKER_SETTINGS_BOUNDS) as WorkerSettingsField[]) {
    const bounds = WORKER_SETTINGS_BOUNDS[field];
    if (stored && stored[field] !== undefined && stored[field] !== null) {
      sources[field] = "db";
    } else if (readEnvInt(bounds.envKey, bounds.default, bounds.min, bounds.max) !== null) {
      sources[field] = "env";
    } else {
      sources[field] = "default";
    }
  }

  return { settings, sources };
}