import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PillProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  as?: "span" | "button";
  className?: string;
}

export function Pill({ children, active, onClick, as = "span", className }: PillProps) {
  const Comp: any = onClick ? "button" : as;
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--primary)] text-[var(--on-primary)]"
          : "bg-[var(--surface-card)] text-[var(--ink)] hover:bg-[var(--surface-strong)]",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
