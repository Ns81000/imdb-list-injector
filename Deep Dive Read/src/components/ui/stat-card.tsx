import type { ReactNode, ComponentType } from "react";
import { cn, type BrandColor, isDarkBrand } from "@/lib/utils";

interface StatCardProps {
  eyebrow: string;
  value: ReactNode;
  subtitle?: ReactNode;
  color?: BrandColor | "surface-card";
  icon?: ComponentType<{ className?: string; size?: number }>;
  className?: string;
}

const colorMap: Record<string, string> = {
  "brand-pink": "bg-[var(--brand-pink)]",
  "brand-teal": "bg-[var(--brand-teal)]",
  "brand-lavender": "bg-[var(--brand-lavender)]",
  "brand-peach": "bg-[var(--brand-peach)]",
  "brand-ochre": "bg-[var(--brand-ochre)]",
  "brand-mint": "bg-[var(--brand-mint)]",
  "surface-card": "bg-[var(--surface-card)] border border-[var(--hairline)]",
};

export function StatCard({
  eyebrow,
  value,
  subtitle,
  color = "surface-card",
  icon: Icon,
  className,
}: StatCardProps) {
  const isDark = color !== "surface-card" && isDarkBrand(color as BrandColor);
  const isSurface = color === "surface-card";

  // Text contrast logic
  const eyebrowColor = isDark
    ? "text-white/80"
    : isSurface
    ? "text-[var(--muted)]"
    : "text-black/60";

  const valueColor = isDark
    ? "text-white"
    : isSurface
    ? "text-[var(--ink)]"
    : "text-black/90";

  const subtitleColor = isDark
    ? "text-white/80"
    : isSurface
    ? "text-[var(--muted)]"
    : "text-black/70";

  const badgeBg = isDark
    ? "bg-white/20 text-white"
    : isSurface
    ? "bg-[var(--surface-strong)] text-[var(--ink)]"
    : "bg-black/10 text-black/80";

  return (
    <div
      className={cn(
        "group flex h-full flex-col justify-between overflow-hidden rounded-[22px] p-5 md:p-6",
        "transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:-translate-y-1 hover:shadow-xl active:scale-[0.98]",
        colorMap[color],
        className
      )}
    >
      {/* Header: Eyebrow + Icon Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={cn("caption-upper text-[11px] font-bold tracking-wider truncate", eyebrowColor)}>
          {eyebrow}
        </span>
        {Icon && (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110", badgeBg)}>
            <Icon size={15} />
          </div>
        )}
      </div>

      {/* Stat Value */}
      <div className={cn("my-1 text-2xl font-bold tracking-tight sm:text-3xl whitespace-nowrap overflow-hidden text-ellipsis", valueColor)}>
        {value}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div className={cn("caption mt-1 text-xs font-medium truncate", subtitleColor)}>
          {subtitle}
        </div>
      )}
    </div>
  );
}


