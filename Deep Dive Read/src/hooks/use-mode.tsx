import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Mode } from "@/types";

const KEY = "zo_mode";

interface Ctx {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeCtx = createContext<Ctx | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  // Read localStorage synchronously during initialization to avoid hydration mismatch
  const [mode, setModeState] = useState<Mode>(() => {
    // SSR safety: localStorage only exists in browser
    if (typeof window === "undefined") return "watching";
    
    try {
      const v = localStorage.getItem(KEY);
      if (v === "watched" || v === "watching") return v;
    } catch {
      // Ignore localStorage errors (private browsing, etc.)
    }
    return "watching";
  });

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // Ignore localStorage errors
    }
  }, []);
  
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>;
}

export function useMode(): Ctx {
  const ctx = useContext(ModeCtx);
  if (!ctx) return { mode: "watching", setMode: () => {} };
  return ctx;
}
