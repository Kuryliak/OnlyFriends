import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "default" | "accent" | "danger";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  label: string;
  children: ReactNode;
  size?: "sm" | "md";
}

const tones: Record<Tone, string> = {
  default:
    "text-text-muted hover:text-text-primary hover:bg-surface-overlay border-transparent hover:border-border-subtle/80",
  accent: "text-text-muted hover:text-accent hover:bg-accent/10 border-transparent hover:border-accent/25",
  danger:
    "text-text-muted hover:text-status-error hover:bg-status-error/10 border-transparent hover:border-status-error/25",
};

const sizes = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-9 w-9 rounded-xl",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, tone = "default", size = "sm", label, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        "active:scale-95 cursor-pointer disabled:opacity-40 disabled:pointer-events-none",
        tones[tone],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
IconButton.displayName = "IconButton";