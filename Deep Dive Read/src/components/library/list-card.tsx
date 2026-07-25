import { Link } from "@tanstack/react-router";
import type { List, Movie } from "@/types";
import { relativeTime, parseGenres, parseRating } from "@/lib/utils";
import { Pill } from "../ui/pill";

interface ListCardProps {
  list: List;
  movies?: Movie[];
}

export function ListCard({ list, movies = [] }: ListCardProps) {
  const genreCounts = new Map<string, number>();
  for (const m of movies) {
    for (const g of parseGenres(m.genre)) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);

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
      className="flex flex-col gap-3 rounded-[16px] border border-[var(--hairline)] bg-[var(--canvas)] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="title-sm text-[var(--ink)]">{list.name}</div>
          <div className="caption mt-1 text-[var(--muted)]">
            Updated {relativeTime(list.last_refreshed)}
          </div>
        </div>
        <Pill className="shrink-0">{list.movie_count}</Pill>
      </div>
      {topGenres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topGenres.map((g) => (
            <Pill key={g} className="text-[11px]">
              {g}
            </Pill>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-end gap-1 h-8" aria-hidden="true">
        {bins.map((b, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-[var(--brand-lavender)]"
            style={{ height: `${(b / maxBin) * 100}%`, minHeight: 2, opacity: 0.4 + (i / 4) * 0.6 }}
          />
        ))}
      </div>
    </Link>
  );
}
