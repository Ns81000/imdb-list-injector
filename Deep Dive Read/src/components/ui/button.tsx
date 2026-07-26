import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "onColor" | "danger";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-[12px] font-semibold text-[14px] leading-none transition-colors duration-150 disabled:cursor-not-allowed select-none";

const sizes: Record<Size, string> = {
  md: "h-[44px] px-5",
  sm: "h-[36px] px-4 text-[13px]",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-active)] active:bg-[var(--primary-active)] disabled:bg-[var(--primary-disabled)] disabled:text-[var(--muted)]",
  secondary:
    "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--hairline)] hover:bg-[var(--surface-soft)] disabled:text-[var(--muted-soft)]",
  ghost:
    "bg-transparent text-[var(--ink)] hover:bg-[var(--surface-soft)] disabled:text-[var(--muted-soft)]",
  onColor: "bg-[var(--canvas)] text-[var(--ink)] hover:bg-[var(--surface-soft)]",
  danger: "bg-[var(--error)] text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {children}
    </button>
  );
}
