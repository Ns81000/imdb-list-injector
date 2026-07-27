import { useEffect, type ReactNode } from "react";
import { CloseIcon } from "../icons";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="zo-fade-in fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      style={{
        background: "rgba(10, 10, 10, 0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        className={cn(
          "zo-scale-in relative w-full max-w-[760px] rounded-[32px] border border-[var(--hairline)] bg-[var(--canvas)] p-6 sm:p-8 shadow-[var(--shadow-popover)]",
          className,
        )}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-soft)] text-[var(--muted)] hover:bg-[var(--surface-card)] hover:text-[var(--ink)] active:scale-95 transition-all duration-150 focus:outline-none"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
        {title && <div className="title-lg mb-4 pr-10 text-[var(--ink)]">{title}</div>}
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

