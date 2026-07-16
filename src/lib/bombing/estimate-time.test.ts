import { describe, expect, it } from "vitest";
import { estimateOutreachDuration } from "./estimate-time";

describe("estimateOutreachDuration", () => {
  it("friends-only is faster than chain subscribe", () => {
    const friendsOnly = estimateOutreachDuration({
      targetCount: 100,
      accountCount: 10,
      chainSubscribe: false,
    });
    const withSub = estimateOutreachDuration({
      targetCount: 100,
      accountCount: 10,
      chainSubscribe: true,
    });
    expect(friendsOnly.seconds).toBeLessThan(withSub.seconds);
  });

  it("defaults to friends-only (no double action)", () => {
    const a = estimateOutreachDuration({ targetCount: 20, accountCount: 4 });
    const b = estimateOutreachDuration({
      targetCount: 20,
      accountCount: 4,
      chainSubscribe: false,
    });
    expect(a.seconds).toBe(b.seconds);
  });
});
