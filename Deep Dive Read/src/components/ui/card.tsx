import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] bg-[var(--surface-card)] p-6 md:p-7 shadow-[0_8px_24px_rgba(0,0,0,0.03)]",
        interactive &&
          "cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] active:scale-[0.98]",
        className,
      )}
    >
      {children}
    </div>
  );
}
