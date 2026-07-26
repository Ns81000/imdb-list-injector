import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface SegmentedProps {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  size?: "sm" | "md";
  className?: string;
}

export function SegmentedControl({
  value,
  onChange,
  options,
  size = "md",
  className,
}: SegmentedProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex rounded-full bg-[var(--surface-soft)] p-1",
        size === "sm" ? "gap-0" : "gap-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full font-medium transition-all duration-200",
              // Meet 44px tap target on touch devices by bumping vertical padding on sm.
              size === "sm" ? "px-3 py-2 text-[12px]" : "px-4 py-2 text-[13px]",
              active
                ? "bg-[var(--canvas)] text-[var(--ink)] shadow-[var(--shadow-inset)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
