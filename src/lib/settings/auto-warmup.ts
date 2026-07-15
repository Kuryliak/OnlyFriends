import { prisma } from "@/lib/db";
import {
  AUTO_WARMUP_BOUNDS,
  AUTO_WARMUP_ENABLED_ENV,
  type AutoWarmupSettings,
} from "@/lib/settings/auto-warmup-shared";

export const AUTO_WARMUP_SETTINGS_KEY = "auto_warmup_settings";

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function readEnvInt(name: string, fallback: number, min: number, max: number): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

export function readEnvAutoWarmupSettings(): AutoWarmupSettings {
  const interval =
    readEnvInt(
      AUTO_WARMUP_BOUNDS.intervalMinutes.envKey,
      AUTO_WARMUP_BOUNDS.intervalMinutes.default,
      AUTO_WARMUP_BOUNDS.intervalMinutes.min,
      AUTO_WARMUP_BOUNDS.intervalMinutes.max
    ) ?? AUTO_WARMUP_BOUNDS.intervalMinutes.default;

  const duration =
    readEnvInt(
      AUTO_WARMUP_BOUNDS.durationMinutes.envKey,
      AUTO_WARMUP_BOUNDS.durationMinutes.default,
      AUTO_WARMUP_BOUNDS.durationMinutes.min,
      AUTO_WARMUP_BOUNDS.durationMinutes.max
    ) ?? AUTO_WARMUP_BOUNDS.durationMinutes.default;

  const maxPerCycle =
    readEnvInt(
      AUTO_WARMUP_BOUNDS.maxPerCycle.envKey,
      AUTO_WARMUP_BOUNDS.maxPerCycle.default,
      AUTO_WARMUP_BOUNDS.maxPerCycle.min,
      AUTO_WARMUP_BOUNDS.maxPerCycle.max
    ) ?? AUTO_WARMUP_BOUNDS.maxPerCycle.default;

  return {
    enabled: readBool(AUTO_WARMUP_ENABLED_ENV, true),
    intervalMinutes: interval,
    durationMinutes: duration,
    maxPerCycle,
  };
}

export function normalizeAutoWarmupSettings(input: Partial<AutoWarmupSettings>): AutoWarmupSettings {
  const env = readEnvAutoWarmupSettings();
  return {
    enabled: input.enabled ?? env.enabled,
    intervalMinutes: clamp(
      input.intervalMinutes ?? env.intervalMinutes,
      AUTO_WARMUP_BOUNDS.intervalMinutes.min,
      AUTO_WARMUP_BOUNDS.intervalMinutes.max
    ),
    durationMinutes: clamp(
      input.durationMinutes ?? env.durationMinutes,
      AUTO_WARMUP_BOUNDS.durationMinutes.min,
      AUTO_WARMUP_BOUNDS.durationMinutes.max
    ),
    maxPerCycle: clamp(
      input.maxPerCycle ?? env.maxPerCycle,
      AUTO_WARMUP_BOUNDS.maxPerCycle.min,
      AUTO_WARMUP_BOUNDS.maxPerCycle.max
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function getStoredAutoWarmupSettings(): Promise<Partial<AutoWarmupSettings> | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: AUTO_WARMUP_SETTINGS_KEY } });
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value) as Partial<AutoWarmupSettings>;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export async function setAutoWarmupSettings(
  input: Partial<AutoWarmupSettings>
): Promise<AutoWarmupSettings> {
  const normalized = normalizeAutoWarmupSettings(input);
  await prisma.appSetting.upsert({
    where: { key: AUTO_WARMUP_SETTINGS_KEY },
    create: { key: AUTO_WARMUP_SETTINGS_KEY, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  });
  return normalized;
}

export async function resolveAutoWarmupSettings(): Promise<AutoWarmupSettings> {
  const stored = await getStoredAutoWarmupSettings();
  return normalizeAutoWarmupSettings(stored ?? {});
}

let cachedSettings: AutoWarmupSettings = readEnvAutoWarmupSettings();

export function getAutoWarmupConfig(): AutoWarmupSettings {
  return cachedSettings;
}

export async function refreshAutoWarmupConfig(): Promise<AutoWarmupSettings> {
  cachedSettings = await resolveAutoWarmupSettings();
  return cachedSettings;
}