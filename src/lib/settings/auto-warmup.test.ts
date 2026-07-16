import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeAutoWarmupSettings,
  readEnvAutoWarmupSettings,
} from "./auto-warmup";

describe("normalizeAutoWarmupSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves enabled: false (must not fall back to env default true)", () => {
    vi.stubEnv("AUTO_WARMUP_ENABLED", "true");
    const result = normalizeAutoWarmupSettings({
      enabled: false,
      intervalMinutes: 90,
      durationMinutes: 3,
      maxPerCycle: 2,
    });
    expect(result.enabled).toBe(false);
  });

  it("preserves enabled: true", () => {
    vi.stubEnv("AUTO_WARMUP_ENABLED", "false");
    const result = normalizeAutoWarmupSettings({
      enabled: true,
      intervalMinutes: 90,
      durationMinutes: 3,
      maxPerCycle: 2,
    });
    expect(result.enabled).toBe(true);
  });

  it("clamps numeric bounds", () => {
    const result = normalizeAutoWarmupSettings({
      enabled: true,
      intervalMinutes: 1,
      durationMinutes: 999,
      maxPerCycle: 0,
    });
    expect(result.intervalMinutes).toBe(15);
    expect(result.durationMinutes).toBe(30);
    expect(result.maxPerCycle).toBe(1);
  });

  it("uses env defaults when fields omitted", () => {
    vi.stubEnv("AUTO_WARMUP_ENABLED", "false");
    vi.stubEnv("AUTO_WARMUP_INTERVAL_MIN", "60");
    const result = normalizeAutoWarmupSettings({});
    expect(result.enabled).toBe(false);
    expect(result.intervalMinutes).toBe(60);
  });
});

describe("readEnvAutoWarmupSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults enabled to true when env unset", () => {
    vi.stubEnv("AUTO_WARMUP_ENABLED", "");
    const result = readEnvAutoWarmupSettings();
    expect(result.enabled).toBe(true);
  });
});
