import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckIcon, AlertIcon, CloseIcon } from "../icons";
import { cn } from "@/lib/utils";

type ToastType = "info" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-2 pb-safe">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "zo-slide-up pointer-events-auto flex items-center gap-3 rounded-[12px] bg-[var(--surface-dark)] px-5 py-3 text-[var(--on-dark)] shadow-[0_8px_24px_rgba(0,0,0,0.20)]",
              t.type === "success" && "border-l-4 border-[var(--success)]",
              t.type === "error" && "border-l-4 border-[var(--error)]",
            )}
          >
            {t.type === "success" && <CheckIcon size={16} className="text-[var(--success)]" />}
            {t.type === "error" && <AlertIcon size={16} className="text-[var(--error)]" />}
            <span className="body-sm">{t.message}</span>
            <button
              onClick={() => setToasts((tt) => tt.filter((x) => x.id !== t.id))}
              className="ml-2 text-[var(--on-dark-soft)] hover:text-[var(--on-dark)]"
              aria-label="Dismiss"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// stub to satisfy any missed effect deps rule
export function useMounted() {
  const [m, s] = useState(false);
  useEffect(() => s(true), []);
  return m;
}
