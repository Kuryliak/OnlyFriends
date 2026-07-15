"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchToast({
  message,
  onDismiss,
  className,
  floating = false,
  variant = "success",
}: {
  message: string;
  onDismiss: () => void;
  className?: string;
  floating?: boolean;
  variant?: "success" | "error" | "warning";
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const boxClass =
    variant === "success"
      ? "border-status-active/35 bg-status-active/10 backdrop-blur-md shadow-card"
      : variant === "warning"
        ? "border-amber-500/35 bg-amber-500/10 backdrop-blur-md shadow-card"
        : "border-status-error/35 bg-status-error/10 backdrop-blur-md shadow-card";

  const iconClass =
    variant === "success"
      ? "text-status-active"
      : variant === "warning"
        ? "text-amber-600"
        : "text-status-error";

  const content = (
    <div
      className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3.5", boxClass, className)}
      role="status"
    >
      {variant === "success" ? (
        <CheckCircle2 size={18} className={cn(iconClass, "shrink-0 mt-0.5")} />
      ) : (
        <AlertCircle size={18} className={cn(iconClass, "shrink-0 mt-0.5")} />
      )}
      <p className="text-sm text-text-primary flex-1">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );

  if (floating && mounted) {
    return createPortal(
      <div className="fixed top-4 left-4 right-4 sm:left-[15rem] sm:right-8 z-[60] pointer-events-none">
        <div className="pointer-events-auto max-w-2xl">{content}</div>
      </div>,
      document.body
    );
  }

  return content;
}