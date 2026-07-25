import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Mode } from "@/types";

const KEY = "zo_mode";

interface Ctx {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeCtx = createContext<Ctx | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("watching");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "watched" || v === "watching") setModeState(v);
    } catch {}
  }, []);
  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }, []);
  return <ModeCtx.Provider value={{ mode, setMode }}>{children}</ModeCtx.Provider>;
}

export function useMode(): Ctx {
  const ctx = useContext(ModeCtx);
  if (!ctx) return { mode: "watching", setMode: () => {} };
  return ctx;
}
