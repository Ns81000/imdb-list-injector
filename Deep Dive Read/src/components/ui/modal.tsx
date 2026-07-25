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
      className="zo-fade-in fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(10, 10, 10, 0.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        className={cn(
          "zo-scale-in relative w-full max-w-[480px] rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] p-8",
          className,
        )}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
        {title && <div className="title-lg mb-4 pr-8">{title}</div>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
