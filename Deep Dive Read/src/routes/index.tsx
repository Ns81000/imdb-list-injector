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
  parseDurationToMinutes,
  formatMinutes,
  parseRating,
  parseGenres,
  relativeTime,
  brandCycle,
} from "@/lib/utils";
import { Pill } from "@/components/ui/pill";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Zoom Out" },
      { name: "description", content: "Overview of your saved movies: totals, ratings, genres, and runtime." },
      { property: "og:title", content: "Dashboard — Zoom Out" },
      { property: "og:description", content: "Overview of your saved movies: totals, ratings, genres, and runtime." },
    ],
  }),
  component: () => (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  ),
});

function Dashboard() {
  const { mode } = useMode();
  const listsQ = useQuery({ queryKey: ["lists", mode], queryFn: () => listLists({ data: { mode } }) });
  const moviesQ = useQuery({ queryKey: ["movies", mode], queryFn: () => listMovies({ data: { mode } }) });
  const { latest, status } = useSyncStatus();

  const lists = listsQ.data ?? [];
  const movies = moviesQ.data ?? [];

  const stats = useMemo(() => {
    const unique = new Set(movies.map((m) => m.imdb_id));
    const ratings = movies.map((m) => parseRating(m.rating)).filter((r): r is number => r !== null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const genreCounts = new Map<string, number>();
    for (const m of movies) for (const g of parseGenres(m.genre)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
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

  const cards: Array<{ eyebrow: string; value: React.ReactNode; subtitle?: React.ReactNode }> = [
    { eyebrow: "Total Titles", value: stats.total, subtitle: `across ${stats.lists} list${stats.lists === 1 ? "" : "s"}` },
    { eyebrow: "Average Rating", value: stats.avg ? stats.avg.toFixed(1) : "—", subtitle: "IMDb average" },
    { eyebrow: "Top Genre", value: stats.topGenre?.[0] ?? "—", subtitle: stats.topGenre ? `${stats.topGenre[1]} titles` : "" },
    { eyebrow: "Total Runtime", value: formatMinutes(stats.totalMins), subtitle: "of content" },
    { eyebrow: "Keywords", value: stats.keywords, subtitle: "unique keywords" },
    {
      eyebrow: "Last Synced",
      value: latest ? relativeTime(latest.synced_at) : "—",
      subtitle: latest ? `${latest.movies_count ?? 0} movies · ${status}` : "no syncs yet",
    },
  ];

  const recent = lists.slice(0, 5);

  return (
    <PageShell>
      <div className="mb-6 lg:hidden">
        <h1 className="display-md">Dashboard</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c, i) => (
          <StatCard
            key={c.eyebrow}
            color={i === 5 ? "surface-card" : brandCycle(i)}
            eyebrow={c.eyebrow}
            value={c.value}
            subtitle={c.subtitle}
          />
        ))}
      </div>

      <section className="mt-10">
        <h2 className="title-lg mb-4">Recent Activity</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recent.map((l) => (
            <Link
              key={l.id}
              to="/library/$listId"
              params={{ listId: l.id }}
              className="rounded-[16px] border border-[var(--hairline)] bg-[var(--canvas)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="title-sm">{l.name}</div>
                <Pill>{l.movie_count}</Pill>
              </div>
              <div className="caption mt-2 text-[var(--muted)]">Updated {relativeTime(l.last_refreshed)}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg mb-4">Rating Distribution</h2>
          <RatingHistogram movies={movies} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Timeline</h2>
          <YearTimeline movies={movies} />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="title-lg mb-4">Genre Landscape</h2>
        <GenreBars movies={movies} top={15} height={420} />
      </Card>
    </PageShell>
  );
}
