import { since24h, sinceDays } from "./dashboard";

export type StatsRange = "24h" | "7d" | "30d" | "all";

export const DEFAULT_STATS_RANGE: StatsRange = "24h";

export const STATS_RANGES: StatsRange[] = ["24h", "7d", "30d", "all"];

export function parseStatsRange(value: string | null | undefined): StatsRange {
  if (value === "7d" || value === "30d" || value === "all") return value;
  return DEFAULT_STATS_RANGE;
}

export function sinceForRange(range: StatsRange): Date | null {
  switch (range) {
    case "24h":
      return since24h();
    case "7d":
      return sinceDays(7);
    case "30d":
      return sinceDays(30);
    case "all":
      return null;
  }
}

export function chartBucketCount(range: StatsRange): number {
  switch (range) {
    case "24h":
      return 24;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "all":
      return 14;
  }
}

export function isHourlyChart(range: StatsRange): boolean {
  return range === "24h";
}