import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-[44px] w-full rounded-[12px] border bg-[var(--canvas)] px-4 text-[16px] text-[var(--ink)] outline-none transition-all duration-150 placeholder:text-[var(--muted-soft)]",
        error
          ? "border-[var(--error)] focus:border-[var(--error)] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.10)]"
          : "border-[var(--hairline)] focus:border-[var(--ink)] focus:border-2",
        "disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)]",
        className,
      )}
      {...rest}
    />
  );
});
