import { Link, useLocation } from "@tanstack/react-router";
import { ZoomOutLogo } from "../brand/zoom-out-logo";
import { SegmentedControl } from "../ui/segmented-control";
import { useMode } from "@/hooks/use-mode";
import { useSyncStatus, statusColor } from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";
import type { Mode } from "@/types";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/library", label: "Library" },
  { to: "/analytics", label: "Analytics" },
  { to: "/credits", label: "Credits" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Settings" },
] as const;

export function DesktopNav() {
  const location = useLocation();
  const { mode, setMode } = useMode();
  const { status, tooltip } = useSyncStatus();
  return (
    <header className="relative z-40 hidden h-16 w-full bg-transparent lg:block">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-8">
        <Link to="/" className="flex items-center gap-2">
          <ZoomOutLogo size={32} />
          <span className="title-md tracking-tight">Zoom Out</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active =
              l.to === "/"
                ? location.pathname === "/"
                : location.pathname === l.to || location.pathname.startsWith(l.to + "/");
            return (
              <Link
                key={l.to}
                to={l.to as any}
                className={cn(
                  "nav-link relative rounded-md px-3 py-2 transition-colors",
                  active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]",
                )}
              >
                {l.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-[var(--brand-pink)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { value: "watching", label: "Watching" },
              { value: "watched", label: "Watched" },
            ]}
          />
          <span
            title={tooltip}
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: statusColor(status) }}
            aria-label={`Sync status: ${status}`}
          />
        </div>
      </div>
    </header>
  );
}
