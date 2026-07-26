import { Link } from "@tanstack/react-router";
import type { List, Movie } from "@/types";
import { relativeTime, parseRating, hashBrand, cn, type BrandColor } from "@/lib/utils";
import { Film, ChevronRight } from "lucide-react";

interface ListCardProps {
  list: List;
  movies?: Movie[];
}

const brandAccentMap: Record<BrandColor, { badge: string; textHover: string; bar: string }> = {
  "brand-pink": {
    badge: "bg-[#ff4d8b] text-white shadow-sm shadow-[#ff4d8b]/20",
    textHover: "group-hover:text-[#e02669]",
    bar: "bg-[#ff4d8b]",
  },
  "brand-teal": {
    badge: "bg-[#1a3a3a] text-white shadow-sm shadow-[#1a3a3a]/20",
    textHover: "group-hover:text-[#1a3a3a]",
    bar: "bg-[#1a3a3a]",
  },
  "brand-lavender": {
    badge: "bg-[#967adb] text-white shadow-sm shadow-[#967adb]/20",
    textHover: "group-hover:text-[#5e3da8]",
    bar: "bg-[#967adb]",
  },
  "brand-peach": {
    badge: "bg-[#f58b54] text-white shadow-sm shadow-[#f58b54]/20",
    textHover: "group-hover:text-[#c95318]",
    bar: "bg-[#f58b54]",
  },
  "brand-ochre": {
    badge: "bg-[#d49e24] text-white shadow-sm shadow-[#d49e24]/20",
    textHover: "group-hover:text-[#9e6f00]",
    bar: "bg-[#d49e24]",
  },
  "brand-mint": {
    badge: "bg-[#4da890] text-white shadow-sm shadow-[#4da890]/20",
    textHover: "group-hover:text-[#146b54]",
    bar: "bg-[#4da890]",
  },
  "brand-coral": {
    badge: "bg-[#ff6b5a] text-white shadow-sm shadow-[#ff6b5a]/20",
    textHover: "group-hover:text-[#d93b28]",
    bar: "bg-[#ff6b5a]",
  },
};

export function ListCard({ list, movies = [] }: ListCardProps) {
  const brand = hashBrand(list.name);
  const style = brandAccentMap[brand];

  // 5 rating buckets 2/4/6/8/10
  const bins = [0, 0, 0, 0, 0];
  for (const m of movies) {
    const r = parseRating(m.rating);
    if (r === null) continue;
    const idx = Math.min(4, Math.max(0, Math.floor(r / 2)));
    bins[idx]++;
  }
  const maxBin = Math.max(1, ...bins);

  return (
    <Link
      to="/library/$listId"
      params={{ listId: list.id }}
      className="group relative flex flex-col justify-between overflow-hidden rounded-[20px] border border-[var(--hairline)] bg-[var(--surface-card)] p-5 transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:-translate-y-1 hover:shadow-md hover:border-[var(--hairline-soft)] active:scale-[0.98]"
    >
      {/* Top Brand Accent Bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 opacity-90 transition-opacity group-hover:opacity-100",
          style.bar,
        )}
      />

      <div>
        <div className="flex items-start justify-between gap-3 pt-1 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
                style.badge,
              )}
            >
              <Film size={18} />
            </div>
            <div className="min-w-0">
              <div
                className={cn(
                  "title-sm font-bold text-[var(--ink)] transition-colors truncate",
                  style.textHover,
                )}
              >
                {list.name}
              </div>
              <div className="caption text-xs text-[var(--muted)] mt-0.5">
                Updated {relativeTime(list.last_refreshed)}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">
            {list.movie_count} {list.movie_count === 1 ? "title" : "titles"}
          </span>
        </div>

        {/* Rating distribution sparkline */}
        <div className="my-2 flex items-end gap-1 h-5" aria-hidden="true">
          {bins.map((b, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-t transition-opacity group-hover:opacity-100",
                style.bar,
              )}
              style={{
                height: `${(b / maxBin) * 100}%`,
                minHeight: 2,
                opacity: 0.35 + (i / 4) * 0.65,
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--hairline-soft)] pt-3 mt-2 text-xs font-medium text-[var(--muted)]">
        <span>View list analytics</span>
        <ChevronRight
          size={15}
          className="text-[var(--muted-soft)] transition-transform duration-200 group-hover:translate-x-1 group-hover:text-[var(--ink)]"
        />
      </div>
    </Link>
  );
}
