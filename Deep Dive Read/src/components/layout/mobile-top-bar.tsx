import { Link, useLocation } from "@tanstack/react-router";
import { ZoomOutLogo } from "../brand/zoom-out-logo";
import { SegmentedControl } from "../ui/segmented-control";
import { useMode } from "@/hooks/use-mode";
import { useSyncStatus, statusColor } from "@/hooks/use-sync-status";
import type { Mode } from "@/types";

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/library": "Library",
  "/analytics": "Analytics",
  "/credits": "Credits",
  "/search": "Search",
  "/settings": "Settings",
};

export function MobileTopBar() {
  const location = useLocation();
  const { mode, setMode } = useMode();
  const { status, tooltip } = useSyncStatus();
  const title =
    titles[location.pathname] ??
    (location.pathname.startsWith("/library/")
      ? "List"
      : location.pathname.startsWith("/movie/")
        ? "Movie"
        : "");
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--hairline)] bg-[var(--canvas)] px-4 lg:hidden">
      <Link to="/" className="flex items-center gap-2">
        <ZoomOutLogo size={24} />
        <span
          title={tooltip}
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: statusColor(status) }}
        />
      </Link>
      {title && <div className="title-sm text-[var(--ink)]">{title}</div>}
      <SegmentedControl
        size="sm"
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        options={[
          { value: "watching", label: "Watching" },
          { value: "watched", label: "Watched" },
        ]}
      />
    </header>
  );
}
