import type { ReactNode } from "react";
import { DesktopNav } from "./desktop-nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { MobileTopBar } from "./mobile-top-bar";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
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
  );
}
