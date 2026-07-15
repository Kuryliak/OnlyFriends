"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchToast } from "@/components/search-toast";
import { useI18n } from "@/lib/i18n/context";
import type { OutreachBatchSummary } from "@/lib/outreach/batch";

const SEEN_KEY = "outreach_batches_seen";
const POLL_MS = 4000;

type BatchNotification = {
  id: string;
  status: string;
  targetCount: number;
  accountCount: number;
  summary: OutreachBatchSummary | null;
};

type ToastState = {
  message: string;
  variant: "success" | "error" | "warning";
};

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
}

function totalFailures(summary: OutreachBatchSummary | null): number {
  if (!summary) return 0;
  return summary.friendsFailed + summary.subscribeFailed + summary.failedJobs;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toast, setToast] = useState<ToastState | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const buildMessage = useCallback(
    (batch: BatchNotification): { message: string; variant: ToastState["variant"] } => {
      const summary = batch.summary;
      const friends = summary?.friendsAdded ?? 0;
      const subscribes = summary?.subscribed ?? 0;
      const failed = totalFailures(summary);
      const captcha = summary?.captchaJobs ?? 0;

      switch (batch.status) {
        case "COMPLETED":
          return {
            message: t("outreach.batchCompleted", {
              friends,
              subscribes,
              accounts: batch.accountCount,
            }),
            variant: "success",
          };
        case "FAILED":
          return {
            message: t("outreach.batchFailed", {
              failed: failed || batch.targetCount,
              accounts: batch.accountCount,
            }),
            variant: "error",
          };
        case "PARTIAL":
          return {
            message: t("outreach.batchPartial", {
              friends,
              subscribes,
              failed,
            }),
            variant: "warning",
          };
        case "PAUSED_CAPTCHA":
          return {
            message: t("outreach.batchPausedCaptcha", {
              captcha,
              accounts: batch.accountCount,
            }),
            variant: "warning",
          };
        default:
          return { message: t("outreach.batchUnknown"), variant: "warning" };
      }
    },
    [t]
  );

  const showBatch = useCallback(
    (batch: BatchNotification) => {
      const { message, variant } = buildMessage(batch);
      setToast({ message, variant });
    },
    [buildMessage]
  );

  useEffect(() => {
    seenRef.current = loadSeenIds();

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/outreach/batches?terminal=1");
        if (!res.ok || cancelled) return;

        const batches = (await res.json()) as BatchNotification[];

        if (!primedRef.current) {
          for (const batch of batches) {
            seenRef.current.add(batch.id);
          }
          saveSeenIds(seenRef.current);
          primedRef.current = true;
          return;
        }

        const fresh = batches.filter((batch) => !seenRef.current.has(batch.id)).reverse();

        for (const batch of fresh) {
          seenRef.current.add(batch.id);
          showBatch(batch);
        }

        if (fresh.length) {
          saveSeenIds(seenRef.current);
        }
      } catch {
        // Ignore transient network errors.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showBatch]);

  return (
    <>
      {children}
      {toast && (
        <SearchToast
          floating
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}