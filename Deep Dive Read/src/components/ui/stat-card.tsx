import type { ReactNode } from "react";
import { cn, type BrandColor, isDarkBrand } from "@/lib/utils";

interface StatCardProps {
  eyebrow: string;
  value: ReactNode;
  subtitle?: ReactNode;
  color: BrandColor | "surface-card";
  className?: string;
}

const colorMap: Record<string, string> = {
  "brand-pink": "bg-[var(--brand-pink)]",
  "brand-teal": "bg-[var(--brand-teal)]",
  "brand-lavender": "bg-[var(--brand-lavender)]",
  "brand-peach": "bg-[var(--brand-peach)]",
  "brand-ochre": "bg-[var(--brand-ochre)]",
  "brand-mint": "bg-[var(--brand-mint)]",
  "surface-card": "bg-[var(--surface-card)]",
};

export function StatCard({ eyebrow, value, subtitle, color, className }: StatCardProps) {
  const dark = color !== "surface-card" && isDarkBrand(color as BrandColor);
  const text = dark ? "text-[var(--on-dark)]" : "text-[var(--ink)]";
  const soft = dark ? "text-[var(--on-dark-soft)]" : "text-[var(--body)]";
  return (
    <div className={cn("rounded-[24px] p-6 md:p-8", colorMap[color], text, className)}>
      <div className={cn("caption-upper", soft)}>{eyebrow}</div>
      <div className="mt-3 display-md">{value}</div>
      {subtitle && <div className={cn("mt-2 body-sm", soft)}>{subtitle}</div>}
    </div>
  );
}
