import { prisma } from "@/lib/db";
import { STEALTH_ENABLED_ENV, type StealthSettings } from "@/lib/settings/stealth-shared";

export const STEALTH_SETTINGS_KEY = "stealth_settings";

function readEnvBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function readEnvStealthSettings(): StealthSettings {
  return { enabled: readEnvBool(STEALTH_ENABLED_ENV, false) };
}

let cached: StealthSettings | null = null;

export function getStealthSettingsSync(): StealthSettings {
  return cached ?? readEnvStealthSettings();
}

export function isStealthEnabledSync(): boolean {
  return getStealthSettingsSync().enabled;
}

export async function resolveStealthSettings(): Promise<StealthSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: STEALTH_SETTINGS_KEY } });
  const env = readEnvStealthSettings();

  if (!row?.value) {
    cached = env;
    return env;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<StealthSettings>;
    const settings: StealthSettings = {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : env.enabled,
    };
    cached = settings;
    return settings;
  } catch {
    cached = env;
    return env;
  }
}

export async function saveStealthSettings(settings: StealthSettings): Promise<StealthSettings> {
  const normalized: StealthSettings = { enabled: Boolean(settings.enabled) };
  await prisma.appSetting.upsert({
    where: { key: STEALTH_SETTINGS_KEY },
    create: { key: STEALTH_SETTINGS_KEY, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  });
  cached = normalized;
  return normalized;
}

export async function refreshStealthConfig(): Promise<StealthSettings> {
  return resolveStealthSettings();
}