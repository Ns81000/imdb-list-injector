import type { ReactNode } from "react";
import { DesktopNav } from "./desktop-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { MobileTopBar } from "./mobile-top-bar";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { cn } from "@/lib/utils";

export function PageShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative min-h-screen bg-[var(--canvas)] selection:bg-[#ff4d8b]/20 selection:text-[var(--ink)]">
      <AmbientBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <DesktopNav />
        <MobileTopBar />
        <main
          className={cn(
            "mx-auto w-full px-4 py-6 pb-28 md:px-6 md:py-8 lg:px-8 lg:pb-12",
            wide ? "max-w-[1440px]" : "max-w-[1280px]",
          )}
        >
          {children}
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
