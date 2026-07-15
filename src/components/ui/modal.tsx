"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handler);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full sm:rounded-3xl border border-border/70 bg-surface-raised/95 backdrop-blur-xl shadow-modal",
          "ring-1 ring-white/[0.04] animate-slide-up",
          "grid grid-rows-[auto_minmax(0,1fr)_auto] max-h-[min(92dvh,880px)]",
          wide ? "max-w-2xl" : "max-w-md"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle/60 bg-surface-overlay/20">
          <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="overflow-y-auto min-h-0 p-5 scrollbar-thin overscroll-contain">{children}</div>
        {footer ? (
          <div className="border-t border-border-subtle/60 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-surface-overlay/15">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}