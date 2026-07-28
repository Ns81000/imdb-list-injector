import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { RatingHistogram, YearTimeline, GenreBars } from "@/components/charts";
import { listLists, listMovies } from "@/lib/data.functions";
import { useMode } from "@/hooks/use-mode";
import { useSyncStatus } from "@/hooks/use-sync-status";
import {
  cn,
  parseDurationToMinutes,
  formatMinutes,
  parseRating,
  parseGenres,
  relativeTime,
  brandCycle,
} from "@/lib/utils";
import { Film, Star, Layers, Clock, Hash, RefreshCw, ChevronRight } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import type { BrandColor } from "@/lib/utils";
import { requireAuth } from "@/lib/route-auth";

export const Route = createFileRoute("/")({
  // Finding #6: Check auth before component mount
  beforeLoad: async () => {
    await requireAuth();
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Zoom Out" },
      {
        name: "description",
        content: "Overview of your saved movies: totals, ratings, genres, and runtime.",
      },
      { property: "og:title", content: "Dashboard — Zoom Out" },
      {
        property: "og:description",
        content: "Overview of your saved movies: totals, ratings, genres, and runtime.",
      },
    ],
  }),
  component: () => (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  ),
});

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

function Dashboard() {
  const { mode } = useMode();
  const listsQ = useQuery({
    queryKey: ["lists", mode],
    queryFn: () => listLists({ data: { mode } }),
  });
  const moviesQ = useQuery({
    queryKey: ["movies", mode],
    queryFn: () => listMovies({ data: { mode } }),
  });
  const { latest, status } = useSyncStatus();

  const lists = listsQ.data ?? [];
  const movies = moviesQ.data ?? [];

  const stats = useMemo(() => {
    const unique = new Set(movies.map((m) => m.imdb_id));
    const ratings = movies.map((m) => parseRating(m.rating)).filter((r): r is number => r !== null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const genreCounts = new Map<string, number>();
    for (const m of movies)
      for (const g of parseGenres(m.genre)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const totalMins = movies.reduce((a, m) => a + parseDurationToMinutes(m.duration), 0);
    const keywords = new Set<string>();
    for (const m of movies) for (const k of m.keywords ?? []) keywords.add(k.trim().toLowerCase());
    return {
      total: unique.size,
      lists: lists.length,
      avg,
      topGenre,
      totalMins,
      keywords: keywords.size,
    };
  }, [movies, lists]);

  if (listsQ.isLoading || moviesQ.isLoading) {
    return (
      <PageShell>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="mt-8 h-60" />
      </PageShell>
    );
  }

  if (movies.length === 0) {
    return (
      <PageShell>
        <div className="mx-auto max-w-2xl py-12">
          <EmptyState
            title="Welcome to Zoom Out"
            description="Install the Chrome extension, save some IMDb lists, and your data will appear here."
          />
        </div>
      </PageShell>
    );
  }

  const cards: Array<{
    eyebrow: string;
    value: React.ReactNode;
    subtitle?: React.ReactNode;
    icon: typeof Film;
    color: BrandColor | "surface-card";
  }> = [
    {
      eyebrow: "Total Titles",
      value: stats.total,
      subtitle: `across ${stats.lists} list${stats.lists === 1 ? "" : "s"}`,
      icon: Film,
      color: "brand-pink",
    },
    {
      eyebrow: "Average Rating",
      value: stats.avg ? stats.avg.toFixed(1) : "—",
      subtitle: "IMDb average",
      icon: Star,
      color: "brand-ochre",
    },
    {
      eyebrow: "Top Genre",
      value: stats.topGenre?.[0] ?? "—",
      subtitle: stats.topGenre ? `${stats.topGenre[1]} titles` : "",
      icon: Layers,
      color: "brand-lavender",
    },
    {
      eyebrow: "Total Runtime",
      value: formatMinutes(stats.totalMins),
      subtitle: "of content",
      icon: Clock,
      color: "brand-peach",
    },
    {
      eyebrow: "Keywords",
      value: stats.keywords,
      subtitle: "unique keywords",
      icon: Hash,
      color: "brand-mint",
    },
    {
      eyebrow: "Last Synced",
      value: latest ? relativeTime(latest.synced_at) : "—",
      subtitle: latest ? `${latest.movies_count ?? 0} movies · ${status}` : "no syncs yet",
      icon: RefreshCw,
      color: "brand-teal",
    },
  ];

  const recent = lists.slice(0, 5);

  return (
    <PageShell>
      <div className="mb-6 lg:hidden">
        <h1 className="display-md">Dashboard</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <StatCard
            key={c.eyebrow}
            color={c.color}
            eyebrow={c.eyebrow}
            value={c.value}
            subtitle={c.subtitle}
            icon={c.icon}
          />
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="title-lg font-bold text-[var(--ink)]">Recent Activity</h2>
          <Link
            to="/library"
            className="caption text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1 transition-colors"
          >
            View all lists <ChevronRight size={14} />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recent.map((l, i) => {
            const colorKey = brandCycle(i);
            const style = brandAccentMap[colorKey];
            const listMovies = movies.filter((m) => m.list_id === l.id);

            // 5 rating bins for activity sparkline
            const bins = [0, 0, 0, 0, 0];
            for (const m of listMovies) {
              const r = parseRating(m.rating);
              if (r === null) continue;
              const idx = Math.min(4, Math.max(0, Math.floor(r / 2)));
              bins[idx]++;
            }
            const maxBin = Math.max(1, ...bins);

            return (
              <Link
                key={l.id}
                to="/library/$listId"
                params={{ listId: l.id }}
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
                  <div className="flex items-center justify-between gap-3 pt-1 mb-3">
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
                          {l.name}
                        </div>
                        <div className="caption text-xs text-[var(--muted)] mt-0.5">
                          Updated {relativeTime(l.last_refreshed)}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--surface-strong)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)]">
                      {l.movie_count} {l.movie_count === 1 ? "title" : "titles"}
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
          })}
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e8b94a]/25 text-[#9e6f00]">
                <Star size={16} />
              </div>
              <h2 className="title-lg font-bold text-[var(--ink)]">Rating Distribution</h2>
            </div>
            <span className="caption text-xs font-semibold text-[var(--muted)] bg-[var(--surface-strong)] px-2.5 py-1 rounded-full">
              1.0 – 10.0 Scale
            </span>
          </div>
          <RatingHistogram movies={movies} />
        </Card>
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#b8a4ed]/30 text-[#5e3da8]">
                <Clock size={16} />
              </div>
              <h2 className="title-lg font-bold text-[var(--ink)]">Timeline</h2>
            </div>
            <span className="caption text-xs font-semibold text-[var(--muted)] bg-[var(--surface-strong)] px-2.5 py-1 rounded-full">
              Release Years
            </span>
          </div>
          <YearTimeline movies={movies} />
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#a4d4c5]/35 text-[#146b54]">
              <Layers size={16} />
            </div>
            <h2 className="title-lg font-bold text-[var(--ink)]">Genre Landscape</h2>
          </div>
          <span className="caption text-xs font-semibold text-[var(--muted)] bg-[var(--surface-strong)] px-2.5 py-1 rounded-full">
            Top 15 Genres
          </span>
        </div>
        <GenreBars movies={movies} top={15} height={420} />
      </Card>
    </PageShell>
  );
}
