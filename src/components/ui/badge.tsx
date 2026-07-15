"use client";

import { cn, statusColor } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

const statusDot: Record<string, string> = {
  IDLE: "bg-status-idle",
  ACTIVE: "bg-status-active shadow-[0_0_8px_rgba(52,211,153,0.5)]",
  CAPTCHA: "bg-status-pending",
  BANNED: "bg-status-error",
  ERROR: "bg-status-error",
  PENDING: "bg-status-pending",
  RUNNING: "bg-status-active animate-pulse-soft",
  PAUSED_CAPTCHA: "bg-status-pending",
  COMPLETED: "bg-status-active",
  FAILED: "bg-status-error",
  CANCELLED: "bg-status-idle",
};

const statusGlow: Record<string, string> = {
  ACTIVE: "shadow-[0_0_12px_rgba(52,211,153,0.12)]",
  RUNNING: "shadow-[0_0_12px_rgba(52,211,153,0.12)]",
  PENDING: "shadow-[0_0_12px_rgba(251,191,36,0.1)]",
  PAUSED_CAPTCHA: "shadow-[0_0_12px_rgba(251,191,36,0.1)]",
  CAPTCHA: "shadow-[0_0_12px_rgba(251,191,36,0.1)]",
  FAILED: "shadow-[0_0_12px_rgba(248,113,113,0.1)]",
  ERROR: "shadow-[0_0_12px_rgba(248,113,113,0.1)]",
};

export function Badge({ status }: { status: string }) {
  const { t } = useI18n();
  const label =
    t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : status.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium",
        "bg-surface-overlay/60 border border-border-subtle/70 backdrop-blur-sm",
        statusColor(status),
        statusGlow[status]
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[status] ?? "bg-text-muted")}
        aria-hidden
      />
      {label}
    </span>
  );
}