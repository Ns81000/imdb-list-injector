import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCard, PersonAvatar } from "@/components/credits/person-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MoviePoster } from "@/components/movie/movie-poster";
import { SearchIcon, StarIcon } from "@/components/icons";
import { listMovies } from "@/lib/data.functions";
import { resolveImdb } from "@/lib/tmdb.functions";
import { useMode } from "@/hooks/use-mode";
import { parseRating, primaryYear } from "@/lib/utils";
import type { Movie } from "@/types";

export const Route = createFileRoute("/credits")({
  head: () => ({
    meta: [
      { title: "Credits — Zoom Out" },
      {
        name: "description",
        content: "All the directors, writers, producers and cast across your library.",
      },
      { property: "og:title", content: "Credits — Zoom Out" },
      {
        property: "og:description",
        content: "All the directors, writers, producers and cast across your library.",
      },
    ],
  }),
  component: () => (
    <AuthGate>
      <CreditsPage />
    </AuthGate>
  ),
});

type Role = "Director" | "Writers" | "Producers" | "Cast";

function CreditMovieCard({ movie }: { movie: Movie }) {
  const year = primaryYear(movie.year);
  const rating = parseRating(movie.rating);
  const q = useQuery({
    queryKey: ["tmdb-find", movie.imdb_id],
    queryFn: () => resolveImdb({ data: { imdbId: movie.imdb_id } }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  return (
    <Link
      to="/movie/$imdbId"
      params={{ imdbId: movie.imdb_id }}
      className="group flex items-center gap-3.5 p-3 rounded-[18px] bg-[var(--surface-soft)]/70 hover:bg-[var(--surface-card)] border border-transparent hover:border-[var(--hairline)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.98] text-left"
    >
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-[10px] bg-[var(--surface-card)] shadow-xs">
        <MoviePoster path={q.data?.posterPath ?? null} title={movie.title} size="w185" />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <div className="title-sm text-[var(--ink)] group-hover:text-[var(--primary)] transition-colors line-clamp-1 font-semibold">
          {movie.title}
        </div>
        {movie.genre && (
          <div className="caption text-[var(--muted)] line-clamp-1 text-[12px]">
            {movie.genre}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[12px]">
          {rating !== null && (
            <span className="inline-flex items-center gap-1 text-[var(--ink)] font-semibold">
              <StarIcon size={12} className="text-[var(--brand-ochre)]" />
              <span>{rating.toFixed(1)}</span>
            </span>
          )}
          {year && (
            <span className="caption text-[var(--muted)] font-medium">
              {year}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreditsPage() {
  const { mode } = useMode();
  const q = useQuery({ queryKey: ["movies", mode], queryFn: () => listMovies({ data: { mode } }) });
  const [role, setRole] = useState<Role>("Director");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const movies = q.data ?? [];

  const people = useMemo(() => {
    const counts = new Map<string, { count: number; titles: Movie[] }>();
    for (const m of movies) {
      const raw = m.credits?.[role];
      const list: string[] = Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string")
        : [];
      for (const p of list) {
        const entry = counts.get(p) ?? { count: 0, titles: [] };
        entry.count++;
        entry.titles.push(m);
        counts.set(p, entry);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [movies, role]);

  const shown = showAll ? people : people.slice(0, 30);
  const selectedEntry = selected ? people.find(([n]) => n === selected)?.[1] : undefined;

  const yearRange = useMemo(() => {
    if (!selectedEntry?.titles.length) return null;
    const years = selectedEntry.titles
      .map((m) => primaryYear(m.year))
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b);
    if (!years.length) return null;
    if (years[0] === years[years.length - 1]) return `${years[0]}`;
    return `${years[0]} – ${years[years.length - 1]}`;
  }, [selectedEntry]);

  const filteredTitles = useMemo(() => {
    if (!selectedEntry?.titles) return [];
    if (!searchQuery.trim()) return selectedEntry.titles;
    const qStr = searchQuery.toLowerCase();
    return selectedEntry.titles.filter(
      (m) =>
        m.title.toLowerCase().includes(qStr) ||
        (m.genre && m.genre.toLowerCase().includes(qStr)),
    );
  }, [selectedEntry, searchQuery]);

  if (q.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-10 w-64" />
        <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </PageShell>
    );
  }
  if (movies.length === 0) {
    return (
      <PageShell>
        <EmptyState
          title="No credits yet"
          description="Save some lists to see the people behind them."
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-4 hidden lg:block">
        <h1 className="display-md">Credits</h1>
      </div>
      <SegmentedControl
        value={role}
        onChange={(v) => {
          setRole(v as Role);
          setShowAll(false);
        }}
        options={[
          { value: "Director", label: "Directors" },
          { value: "Writers", label: "Writers" },
          { value: "Producers", label: "Producers" },
          { value: "Cast", label: "Cast" },
        ]}
      />
      {people.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No credits scraped"
            description={`No ${role.toLowerCase()} data in your library yet.`}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {shown.map(([name, entry]) => (
              <PersonCard
                key={name}
                name={name}
                count={entry.count}
                onClick={() => {
                  setSelected(name);
                  setSearchQuery("");
                }}
              />
            ))}
          </div>
          {!showAll && people.length > 30 && (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" onClick={() => setShowAll(true)}>
                Show all {people.length}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selectedEntry && (
          <div>
            {/* Person Hero Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-[var(--hairline-soft)] pb-6 pr-10">
              <div className="shrink-0 rounded-full ring-4 ring-[var(--surface-soft)] shadow-md">
                <PersonAvatar name={selected!} size={80} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="display-sm text-[var(--ink)] font-medium leading-tight truncate">
                  {selected}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[var(--surface-card)] px-3 py-1 caption text-[var(--ink)] font-medium border border-[var(--hairline-soft)]">
                    {selectedEntry.count} title{selectedEntry.count === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-[var(--surface-soft)] px-3 py-1 caption text-[var(--muted)] font-medium">
                    {role}
                  </span>
                  {yearRange && (
                    <span className="inline-flex items-center rounded-full bg-[var(--surface-soft)] px-3 py-1 caption text-[var(--muted)] font-medium">
                      {yearRange}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter & Toolbar Row */}
            <div className="mt-5 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <SearchIcon
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                />
                <input
                  type="text"
                  placeholder="Search titles or genres..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full bg-[var(--surface-soft)] pl-10 pr-4 py-2 text-sm text-[var(--ink)] placeholder-[var(--muted)] border border-transparent focus:border-[var(--hairline)] focus:bg-[var(--canvas)] focus:outline-none transition-all duration-150"
                />
              </div>
              <div className="caption text-[var(--muted)] font-medium hidden sm:block shrink-0">
                {filteredTitles.length} {filteredTitles.length === 1 ? "title" : "titles"}
              </div>
            </div>

            {/* 2-Column Grid Area */}
            <div className="mt-4 max-h-[440px] overflow-y-auto pr-2 -mr-2">
              {filteredTitles.length === 0 ? (
                <div className="py-12 text-center text-[var(--muted)] caption">
                  No titles match "{searchQuery}"
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {filteredTitles.map((m) => (
                    <CreditMovieCard key={m.imdb_id} movie={m} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}


