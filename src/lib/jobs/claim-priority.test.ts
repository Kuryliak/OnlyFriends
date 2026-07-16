import { describe, expect, it } from "vitest";
import type { JobType } from "@prisma/client";
import { jobClaimPriority } from "./claim";

describe("jobClaimPriority (friends traffic first)", () => {
  it("ranks ADD_FRIENDS above everything", () => {
    expect(jobClaimPriority("ADD_FRIENDS")).toBeLessThan(jobClaimPriority("SUBSCRIBE"));
    expect(jobClaimPriority("ADD_FRIENDS")).toBeLessThan(jobClaimPriority("WARMUP_SCROLL"));
    expect(jobClaimPriority("ADD_FRIENDS")).toBeLessThan(jobClaimPriority("REGISTER"));
  });

  it("ranks SUBSCRIBE above warmup", () => {
    expect(jobClaimPriority("SUBSCRIBE")).toBeLessThan(jobClaimPriority("WARMUP_SCROLL"));
  });

  it("ranks warmup lowest so idle heat never steals friend slots", () => {
    const types: JobType[] = [
      "ADD_FRIENDS",
      "SUBSCRIBE",
      "SEND_MESSAGE",
      "REGISTER",
      "VERIFY_EMAIL",
      "UPDATE_PROFILE",
      "WARMUP_SCROLL",
      "LOGIN",
    ];
    const warm = jobClaimPriority("WARMUP_SCROLL");
    for (const t of types) {
      if (t === "WARMUP_SCROLL") continue;
      expect(jobClaimPriority(t)).toBeLessThan(warm);
    }
  });

  it("sorts mixed queue friends first", () => {
    const queue: JobType[] = ["WARMUP_SCROLL", "SUBSCRIBE", "REGISTER", "ADD_FRIENDS"];
    const sorted = [...queue].sort((a, b) => jobClaimPriority(a) - jobClaimPriority(b));
    expect(sorted[0]).toBe("ADD_FRIENDS");
    expect(sorted[sorted.length - 1]).toBe("WARMUP_SCROLL");
  });
});
