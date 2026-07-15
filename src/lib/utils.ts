import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: Date | string | null | undefined,
  locale = "ru"
): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    IDLE: "text-status-idle",
    ACTIVE: "text-status-active",
    CAPTCHA: "text-status-pending",
    BANNED: "text-status-error",
    ERROR: "text-status-error",
    PENDING: "text-status-pending",
    RUNNING: "text-status-active",
    PAUSED_CAPTCHA: "text-status-pending",
    COMPLETED: "text-status-active",
    FAILED: "text-status-error",
    CANCELLED: "text-status-idle",
  };
  return map[status] ?? "text-text-secondary";
}