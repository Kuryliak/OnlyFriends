/**
 * Helpers for worker settings UI: keep live status polling from clobbering
 * in-progress form edits, and allow free typing in numeric fields.
 */

import {
  AUTO_WARMUP_BOUNDS,
  type AutoWarmupSettings,
} from "@/lib/settings/auto-warmup-shared";

/** When a form is dirty, keep the local draft; otherwise take the server value. */
export function pickFormFromServerPoll<T>(
  local: T | null,
  server: T | null | undefined,
  dirty: boolean
): T | null {
  if (dirty && local != null) return local;
  return server ?? null;
}

/** Compare two plain settings objects by JSON (order-stable enough for our shapes). */
export function settingsEqual<T>(a: T | null | undefined, b: T | null | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export type WarmupFieldKey = "enabled" | "intervalMinutes" | "durationMinutes" | "maxPerCycle";

/** Empty string = user cleared the field; on save we apply defaults. */
export type WarmupNumericDraft = number | "";

export type WarmupFormLike = {
  enabled: boolean;
  intervalMinutes: WarmupNumericDraft;
  durationMinutes: WarmupNumericDraft;
  maxPerCycle: WarmupNumericDraft;
};

/**
 * Apply a field update to auto-warmup form state.
 * Empty string is allowed so the user can clear digits while typing.
 * Non-digit garbage is ignored (return null = no change).
 */
export function applyWarmupFieldUpdate(
  form: WarmupFormLike,
  key: WarmupFieldKey,
  raw: string | boolean
): WarmupFormLike | null {
  if (key === "enabled") {
    return { ...form, enabled: Boolean(raw) };
  }
  const text = String(raw).trim();
  if (text === "") {
    return { ...form, [key]: "" };
  }
  // Allow only integer digits (optional leading minus for typing edge cases)
  if (!/^-?\d+$/.test(text)) {
    return null;
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return null;
  return { ...form, [key]: parsed };
}

/**
 * Coerce draft form → API payload. Empty numerics become built-in defaults.
 */
export function resolveWarmupFormForSave(form: WarmupFormLike): AutoWarmupSettings {
  return {
    enabled: form.enabled,
    intervalMinutes:
      form.intervalMinutes === ""
        ? AUTO_WARMUP_BOUNDS.intervalMinutes.default
        : form.intervalMinutes,
    durationMinutes:
      form.durationMinutes === ""
        ? AUTO_WARMUP_BOUNDS.durationMinutes.default
        : form.durationMinutes,
    maxPerCycle:
      form.maxPerCycle === "" ? AUTO_WARMUP_BOUNDS.maxPerCycle.default : form.maxPerCycle,
  };
}

/**
 * Free-edit numeric input: empty allowed; invalid non-numeric ignored.
 * Returns next value or null if the change should be rejected.
 */
export function applyNumericDraft(raw: string, current: number | ""): number | "" | null {
  const text = raw.trim();
  if (text === "") return "";
  if (!/^-?\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
