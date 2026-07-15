import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-surface-raised/70 backdrop-blur-sm overflow-hidden",
        "shadow-card ring-1 ring-white/[0.02]",
        "transition-all duration-300 hover:border-border/80",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  icon,
  description,
}: {
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle/60 bg-gradient-to-r from-surface-overlay/40 to-transparent">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-overlay/80 border border-border-subtle/60 text-accent">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold tracking-tight truncate">{title}</h2>
          {description ? (
            <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}