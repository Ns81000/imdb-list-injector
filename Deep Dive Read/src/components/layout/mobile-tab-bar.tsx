import { Link, useLocation } from "@tanstack/react-router";
import { HomeIcon, LibraryIcon, CreditsIcon, SearchIcon, MoreIcon } from "../icons";
import { cn } from "@/lib/utils";
import type { ComponentType, SVGProps } from "react";

interface Tab {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  matches?: (path: string) => boolean;
}

const tabs: Tab[] = [
  { to: "/", label: "Home", Icon: HomeIcon, matches: (p) => p === "/" },
  {
    to: "/library",
    label: "Library",
    Icon: LibraryIcon,
    matches: (p) => p.startsWith("/library") || p.startsWith("/movie"),
  },
  { to: "/search", label: "Search", Icon: SearchIcon },
  { to: "/credits", label: "Credits", Icon: CreditsIcon },
  {
    to: "/settings",
    label: "More",
    Icon: MoreIcon,
    matches: (p) => p.startsWith("/settings") || p.startsWith("/analytics"),
  },
];

export function MobileTabBar() {
  const location = useLocation();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hairline)] bg-[var(--canvas)] lg:hidden h-tabbar"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-[600px] items-stretch justify-around">
        {tabs.map((t) => {
          const active = t.matches
            ? t.matches(location.pathname)
            : location.pathname === t.to || location.pathname.startsWith(t.to + "/");
          const Icon = t.Icon;
          return (
            <Link
              key={t.to}
              to={t.to as any}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                active ? "text-[var(--brand-pink)]" : "text-[var(--muted)]",
              )}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium leading-none">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
