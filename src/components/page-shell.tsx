import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const sizeClass = {
  sm: "page-shell-sm",
  md: "page-shell-md",
  lg: "page-shell-lg",
  xl: "page-shell-xl",
  "2xl": "page-shell-2xl",
} as const;

export function PageShell({
  children,
  size = "xl",
  className,
}: {
  children: ReactNode;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  return <div className={cn(sizeClass[size], className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function AlertBanner({
  href,
  variant = "pending",
  icon,
  title,
  description,
  action,
  className,
}: {
  href?: string;
  variant?: "pending" | "error";
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className="shrink-0">{icon}</span>
        <p
          className={cn(
            "text-sm font-medium",
            variant === "error" ? "text-status-error" : "text-status-pending"
          )}
        >
          {title}
        </p>
      </div>
      {description ? (
        <p className="text-xs text-text-secondary pl-8 mt-2 leading-relaxed">{description}</p>
      ) : null}
      {action ? <p className="text-xs font-medium text-status-pending pl-8 mt-1.5">{action}</p> : null}
    </>
  );

  const classes = cn(
    variant === "error" ? "alert-banner-error" : "alert-banner-pending",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cn(classes, "space-y-1")}>
        {inner}
      </Link>
    );
  }

  return <div className={cn(classes, "space-y-1")}>{inner}</div>;
}