"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export function CaptchaSolverActions({
  accountId,
  jobId,
  jobType,
  onDone,
  layout = "row",
}: {
  accountId: string;
  jobId?: string | null;
  jobType?: string | null;
  onDone?: () => void;
  layout?: "row" | "stack";
}) {
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  const openBrowser = async () => {
    setOpening(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      const qs = jobType ? `?jobType=${encodeURIComponent(jobType)}` : "";
      const res = await fetch(`/api/accounts/${accountId}/solve-captcha${qs}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.solved) {
        setLastSuccess(
          data.message ??
            (data.autoResumed ? t("captcha.autoResumed") : t("captcha.solveSuccess"))
        );
        onDone?.();
        return;
      }
      if (res.status === 408) {
        setLastError(
          data.error ??
            t("captcha.solveTimeout")
        );
        return;
      }
      setLastError(data.error ?? t("captcha.solveFailed"));
    } catch {
      setLastError(t("captcha.solveFailed"));
    } finally {
      setOpening(false);
    }
  };

  const resumeAfterCaptcha = async () => {
    setResuming(true);
    setLastError(null);
    setLastSuccess(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/resume-after-captcha`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLastError(data.error ?? t("captcha.resumeFailed"));
        return;
      }
      setLastSuccess(
        data.action === "activated"
          ? (data.message ?? t("captcha.activateSuccess"))
          : t("captcha.resumeSuccess")
      );
      onDone?.();
    } catch {
      setLastError(t("captcha.resumeFailed"));
    } finally {
      setResuming(false);
    }
  };

  const wrapClass =
    layout === "stack" ? "flex flex-col gap-2 w-full sm:w-auto" : "flex flex-wrap items-center gap-2";

  return (
    <div className="space-y-2">
      <div className={wrapClass}>
        <Button
          size="sm"
          variant="primary"
          disabled={opening || resuming}
          onClick={() => void openBrowser()}
        >
          <ExternalLink size={14} />
          {opening ? t("jobs.openingCaptchaBrowser") : t("jobs.openCaptchaBrowser")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={opening || resuming}
          onClick={() => void resumeAfterCaptcha()}
        >
          <Play size={14} />
          {resuming
            ? t("captcha.resuming")
            : jobId
              ? t("common.resume")
              : t("captcha.continueAfterSolve")}
        </Button>
      </div>
      {lastError ? (
        <p className="text-xs text-status-error leading-relaxed">{lastError}</p>
      ) : null}
      {lastSuccess ? (
        <p className="text-xs text-status-success leading-relaxed">{lastSuccess}</p>
      ) : null}
    </div>
  );
}