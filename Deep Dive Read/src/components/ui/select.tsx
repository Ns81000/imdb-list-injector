import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon } from "../icons";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = "Select", className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[44px] w-full items-center justify-between rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] px-4 text-left text-[15px] text-[var(--ink)] transition-colors hover:border-[var(--muted-soft)]",
          open && "border-[var(--ink)]",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "" : "text-[var(--muted-soft)]"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          size={18}
          className={cn("shrink-0 text-[var(--muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          className="zo-slide-up absolute z-50 mt-2 max-h-[300px] w-full overflow-y-auto rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          role="listbox"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex h-10 w-full items-center justify-between px-4 text-left text-[15px] hover:bg-[var(--surface-soft)]",
                opt.value === value && "text-[var(--ink)]",
              )}
            >
              <span>{opt.label}</span>
              {opt.value === value && <CheckIcon size={16} className="text-[var(--brand-pink)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
