import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accent-muted text-white border border-accent/25 shadow-btn-primary hover:brightness-110 hover:shadow-glow active:brightness-95",
  secondary:
    "bg-surface-overlay/70 text-text-primary border border-border/70 backdrop-blur-sm hover:bg-surface-elevated hover:border-border shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
  outline:
    "bg-transparent text-text-secondary border border-border/80 hover:text-text-primary hover:bg-surface-overlay/50 hover:border-accent/25",
  ghost:
    "text-text-secondary hover:text-text-primary hover:bg-surface-overlay/60 border border-transparent hover:border-border-subtle/50",
  danger:
    "bg-status-error/10 text-status-error border border-status-error/20 hover:bg-status-error/15 hover:border-status-error/35",
};

const sizes: Record<Size, string> = {
  sm: "min-h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "min-h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "min-h-11 px-5 text-sm gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200",
        "disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        "active:scale-[0.98] cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";