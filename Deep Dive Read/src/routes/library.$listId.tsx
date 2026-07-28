import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { MovieCard } from "@/components/movie/movie-card";
import { Select } from "@/components/ui/select";
import { Pill } from "@/components/ui/pill";
import { ChevronLeftIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { getList } from "@/lib/data.functions";
import {
  formatMinutes,
  parseDurationToMinutes,
  parseGenres,
  parseRating,
  primaryYear,
} from "@/lib/utils";
import { requireAuth } from "@/lib/route-auth";

export const Route = createFileRoute("/library/$listId")({
  // Finding #6: Check auth before component mount
  beforeLoad: async () => {
    await requireAuth();
  },
  head: ({ params }) => ({
    meta: [
      { title: `List ${params.listId} — Zoom Out` },
      { name: "description", content: "Movies in this saved IMDb list." },
      { property: "og:title", content: "List — Zoom Out" },
      { property: "og:description", content: "Movies in this saved IMDb list." },
    ],
  }),
  // Finding #5: Add loader to prefetch list data during route transition
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["list", params.listId],
      queryFn: () => getList({ data: { listId: params.listId } }),
    });
  },
  component: () => (
    <AuthGate>
      <ListDetail />
    </AuthGate>
  ),
});

function ListDetail() {
  const { listId } = Route.useParams();
  const q = useQuery({ queryKey: ["list", listId], queryFn: () => getList({ data: { listId } }) });
  const [sort, setSort] = useState("position");
  const [typeFilter, setTypeFilter] = useState("all");
  const [genreFilter, setGenreFilter] = useState("all");

  const data = q.data;
  const movies = data?.movies ?? [];

  const stats = useMemo(() => {
    const ratings = movies.map((m) => parseRating(m.rating)).filter((x): x is number => x !== null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const genreCounts = new Map<string, number>();
    for (const m of movies)
      for (const g of parseGenres(m.genre)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const totalMins = movies.reduce((s, m) => s + parseDurationToMinutes(m.duration), 0);
    return { avg, topGenre, totalMins };
  }, [movies]);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const m of movies) if (m.type) s.add(m.type);
    return ["all", ...s];
  }, [movies]);
  const genres = useMemo(() => {
    const s = new Set<string>();
    for (const m of movies) for (const g of parseGenres(m.genre)) s.add(g);
    return ["all", ...[...s].sort()];
  }, [movies]);

  const filtered = useMemo(() => {
    let list = [...movies];
    if (typeFilter !== "all") list = list.filter((m) => m.type === typeFilter);
    if (genreFilter !== "all")
      list = list.filter((m) => parseGenres(m.genre).includes(genreFilter));
    switch (sort) {
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "rating":
        list.sort((a, b) => (parseRating(b.rating) ?? 0) - (parseRating(a.rating) ?? 0));
        break;
      case "year":
        list.sort((a, b) => (primaryYear(b.year) ?? 0) - (primaryYear(a.year) ?? 0));
        break;
      case "duration":
        list.sort(
          (a, b) => parseDurationToMinutes(b.duration) - parseDurationToMinutes(a.duration),
        );
        break;
      default:
        list.sort((a, b) => (a.position ?? 999999) - (b.position ?? 999999));
    }
    return list;
  }, [movies, typeFilter, genreFilter, sort]);

  if (q.isLoading) {
    return (
      <PageShell>
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell>
        <EmptyState title="List not found" description="This list is not in your library." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1 body-sm text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <ChevronLeftIcon size={16} /> Back to Library
      </Link>
      <h1 className="display-sm">{data.list.name}</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <Pill>{movies.length} titles</Pill>
        <Pill>Avg {stats.avg ? stats.avg.toFixed(1) : "—"}</Pill>
        {stats.topGenre && <Pill>Top: {stats.topGenre[0]}</Pill>}
        <Pill>{formatMinutes(stats.totalMins)} runtime</Pill>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Select
          value={sort}
          onChange={setSort}
          options={[
            { value: "position", label: "Position" },
            { value: "title", label: "Title A–Z" },
            { value: "rating", label: "Rating" },
            { value: "year", label: "Year" },
            { value: "duration", label: "Duration" },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          options={types.map((t) => ({ value: t, label: t === "all" ? "All types" : t }))}
        />
        <Select
          value={genreFilter}
          onChange={setGenreFilter}
          options={genres.map((g) => ({ value: g, label: g === "all" ? "All genres" : g }))}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No matches" description="Try clearing the filters." />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 [content-visibility:auto] grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((m) => (
            <MovieCard key={`${m.list_id}:${m.imdb_id}`} movie={m} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
