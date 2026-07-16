import { describe, expect, it } from "vitest";
import {
  formatCooldownRemaining,
  isAccountInCooldown,
} from "./cooldown";

describe("account cooldown", () => {
  it("detects active cooldown", () => {
    const until = new Date(Date.now() + 60_000);
    expect(isAccountInCooldown(until)).toBe(true);
    expect(isAccountInCooldown(new Date(Date.now() - 1000))).toBe(false);
    expect(isAccountInCooldown(null)).toBe(false);
  });

  it("formats remaining time", () => {
    const until = new Date(Date.now() + 90 * 60_000);
    expect(formatCooldownRemaining(until)).toMatch(/ч/);
  });
});
