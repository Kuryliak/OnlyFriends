import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function List({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-list", className)} {...props}>
      {children}
    </div>
  );
}

export function ListItem({
  children,
  className,
  selected,
  ...props
}: HTMLAttributes<HTMLDivElement> & { selected?: boolean }) {
  return (
    <div
      className={cn("ui-list-item", selected && "ui-list-item-selected", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ListInteractiveItem({
  children,
  className,
  selected,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "ui-list-item ui-list-item-interactive w-full text-left",
        selected && "ui-list-item-selected",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ListEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("ui-list-empty", className)}>{children}</p>;
}