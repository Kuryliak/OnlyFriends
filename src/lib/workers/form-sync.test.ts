import { describe, expect, it } from "vitest";
import {
  applyNumericDraft,
  applyWarmupFieldUpdate,
  pickFormFromServerPoll,
  resolveWarmupFormForSave,
  settingsEqual,
  type WarmupFormLike,
} from "./form-sync";

const serverWarmup: WarmupFormLike = {
  enabled: false,
  intervalMinutes: 90,
  durationMinutes: 3,
  maxPerCycle: 2,
};

describe("pickFormFromServerPoll", () => {
  it("takes server value when form is clean", () => {
    expect(pickFormFromServerPoll(null, serverWarmup, false)).toEqual(serverWarmup);
    expect(
      pickFormFromServerPoll({ ...serverWarmup, enabled: true }, serverWarmup, false)
    ).toEqual(serverWarmup);
  });

  it("keeps local draft when dirty (poll must not reset toggle/params)", () => {
    const draft = {
      enabled: true,
      intervalMinutes: 45 as const,
      durationMinutes: 5 as const,
      maxPerCycle: 4 as const,
    };
    expect(pickFormFromServerPoll(draft, serverWarmup, true)).toEqual(draft);
  });

  it("after save (dirty=false) adopts server confirmation", () => {
    const draft = { ...serverWarmup, enabled: true };
    const confirmed = { ...serverWarmup, enabled: true };
    expect(pickFormFromServerPoll(draft, confirmed, false)).toEqual(confirmed);
  });

  it("returns null when server has no settings and form is clean", () => {
    expect(pickFormFromServerPoll(null, undefined, false)).toBeNull();
    expect(pickFormFromServerPoll(null, null, false)).toBeNull();
  });

  it("keeps non-null local when dirty even if server is missing", () => {
    const draft = { ...serverWarmup, enabled: true };
    expect(pickFormFromServerPoll(draft, undefined, true)).toEqual(draft);
  });
});

describe("applyWarmupFieldUpdate", () => {
  it("toggles enabled on and off", () => {
    const off = applyWarmupFieldUpdate(serverWarmup, "enabled", true);
    expect(off).toEqual({ ...serverWarmup, enabled: true });
    const on = applyWarmupFieldUpdate(off!, "enabled", false);
    expect(on).toEqual({ ...serverWarmup, enabled: false });
  });

  it("updates numeric params", () => {
    expect(applyWarmupFieldUpdate(serverWarmup, "intervalMinutes", "120")).toEqual({
      ...serverWarmup,
      intervalMinutes: 120,
    });
    expect(applyWarmupFieldUpdate(serverWarmup, "durationMinutes", "7")).toEqual({
      ...serverWarmup,
      durationMinutes: 7,
    });
    expect(applyWarmupFieldUpdate(serverWarmup, "maxPerCycle", "5")).toEqual({
      ...serverWarmup,
      maxPerCycle: 5,
    });
  });

  it("allows clearing a field completely (empty string draft)", () => {
    const cleared = applyWarmupFieldUpdate(serverWarmup, "intervalMinutes", "");
    expect(cleared).toEqual({ ...serverWarmup, intervalMinutes: "" });
    // can type again after clear
    expect(applyWarmupFieldUpdate(cleared!, "intervalMinutes", "1")).toEqual({
      ...serverWarmup,
      intervalMinutes: 1,
    });
  });

  it("allows deleting digits step by step (90 → 9 → empty)", () => {
    let form: WarmupFormLike = serverWarmup;
    form = applyWarmupFieldUpdate(form, "intervalMinutes", "9")!;
    expect(form.intervalMinutes).toBe(9);
    form = applyWarmupFieldUpdate(form, "intervalMinutes", "")!;
    expect(form.intervalMinutes).toBe("");
  });

  it("rejects non-numeric garbage without changing state", () => {
    expect(applyWarmupFieldUpdate(serverWarmup, "intervalMinutes", "abc")).toBeNull();
    expect(applyWarmupFieldUpdate(serverWarmup, "intervalMinutes", "12x")).toBeNull();
  });
});

describe("resolveWarmupFormForSave", () => {
  it("fills defaults for empty numeric fields", () => {
    expect(
      resolveWarmupFormForSave({
        enabled: true,
        intervalMinutes: "",
        durationMinutes: "",
        maxPerCycle: "",
      })
    ).toEqual({
      enabled: true,
      intervalMinutes: 90,
      durationMinutes: 3,
      maxPerCycle: 2,
    });
  });

  it("keeps explicit numbers", () => {
    expect(
      resolveWarmupFormForSave({
        enabled: false,
        intervalMinutes: 45,
        durationMinutes: 5,
        maxPerCycle: 4,
      })
    ).toEqual({
      enabled: false,
      intervalMinutes: 45,
      durationMinutes: 5,
      maxPerCycle: 4,
    });
  });

  it("mixes empty defaults with filled values", () => {
    expect(
      resolveWarmupFormForSave({
        enabled: true,
        intervalMinutes: 120,
        durationMinutes: "",
        maxPerCycle: 3,
      })
    ).toEqual({
      enabled: true,
      intervalMinutes: 120,
      durationMinutes: 3,
      maxPerCycle: 3,
    });
  });
});

describe("applyNumericDraft", () => {
  it("allows empty and integers", () => {
    expect(applyNumericDraft("", 90)).toBe("");
    expect(applyNumericDraft("8", 4)).toBe(8);
    expect(applyNumericDraft("abc", 4)).toBeNull();
  });
});

describe("settingsEqual", () => {
  it("detects dirty vs saved warmup settings", () => {
    const a = { ...serverWarmup, enabled: true };
    const b = { ...serverWarmup, enabled: true };
    expect(settingsEqual(a, b)).toBe(true);
    expect(settingsEqual(a, serverWarmup)).toBe(false);
  });
});
