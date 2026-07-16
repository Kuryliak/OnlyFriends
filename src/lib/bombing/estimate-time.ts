/** Matches default WORKER_OUTREACH_CONCURRENCY when not exposed to the client. */
const DEFAULT_OUTREACH_CONCURRENCY = 2;

/** Per target: page load, scroll, action, and inter-target delay (friends + subscribe). */
const SECONDS_PER_TARGET = {
  min: 10,
  avg: 14,
  max: 22,
} as const;

/** Browser startup + job handoff per account (friends job, then chained subscribe job). */
const JOB_OVERHEAD_SECONDS = 50;

export type OutreachDurationEstimate = {
  seconds: number;
  minSeconds: number;
  maxSeconds: number;
  targetsPerAccount: number;
};

export function estimateOutreachDuration(options: {
  targetCount: number;
  accountCount: number;
  outreachConcurrency?: number;
  /** When false (default), only ADD_FRIENDS counts — faster friends traffic. */
  chainSubscribe?: boolean;
}): OutreachDurationEstimate {
  const {
    targetCount,
    accountCount,
    outreachConcurrency = DEFAULT_OUTREACH_CONCURRENCY,
    chainSubscribe = false,
  } = options;

  if (targetCount <= 0 || accountCount <= 0) {
    return { seconds: 0, minSeconds: 0, maxSeconds: 0, targetsPerAccount: 0 };
  }

  const targetsPerAccount = Math.ceil(targetCount / accountCount);
  const actionsPerTarget = chainSubscribe ? 2 : 1;
  const jobOverhead = chainSubscribe ? JOB_OVERHEAD_SECONDS : Math.round(JOB_OVERHEAD_SECONDS * 0.55);

  const accountMin =
    targetsPerAccount * SECONDS_PER_TARGET.min * actionsPerTarget + jobOverhead;
  const accountAvg =
    targetsPerAccount * SECONDS_PER_TARGET.avg * actionsPerTarget + jobOverhead;
  const accountMax =
    targetsPerAccount * SECONDS_PER_TARGET.max * actionsPerTarget + jobOverhead;

  const parallel = Math.max(1, Math.min(accountCount, outreachConcurrency));
  const waves = Math.ceil(accountCount / parallel);

  return {
    seconds: Math.ceil(waves * accountAvg),
    minSeconds: Math.ceil(waves * accountMin),
    maxSeconds: Math.ceil(waves * accountMax),
    targetsPerAccount,
  };
}

export function formatDurationShort(seconds: number, _locale: "ru" = "ru"): string {
  if (seconds <= 0) return "0 сек";

  if (seconds < 60) {
    return `~${seconds} сек`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `~${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `~${hours} ч`;
  }
  return `~${hours} ч ${mins} мин`;
}

export function formatDurationRange(
  minSeconds: number,
  maxSeconds: number,
  locale: "ru" = "ru"
): string {
  if (maxSeconds <= 0) return "";
  if (minSeconds >= maxSeconds) return formatDurationShort(maxSeconds, locale);
  return `${formatDurationShort(minSeconds, locale)}–${formatDurationShort(maxSeconds, locale)}`;
}