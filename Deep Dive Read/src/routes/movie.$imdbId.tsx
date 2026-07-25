import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MoviePoster } from "@/components/movie/movie-poster";
import { PersonAvatar } from "@/components/credits/person-card";
import { getMovie } from "@/lib/data.functions";
import { resolveImdb } from "@/lib/tmdb.functions";
import { backdropUrl, parseGenres, parseRating, parseVotes, primaryYear } from "@/lib/utils";
import { ChevronLeftIcon, ExternalIcon, StarIcon } from "@/components/icons";

export const Route = createFileRoute("/movie/$imdbId")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.imdbId} — Zoom Out` },
      { name: "description", content: "Movie details from your Zoom Out library." },
      { property: "og:title", content: "Movie — Zoom Out" },
      { property: "og:description", content: "Movie details from your Zoom Out library." },
    ],
  }),
  component: () => (
    <AuthGate>
      <MovieDetail />
    </AuthGate>
  ),
});

function MovieDetail() {
  const { imdbId } = Route.useParams();
  const q = useQuery({ queryKey: ["movie", imdbId], queryFn: () => getMovie({ data: { imdbId } }) });
  const tmdb = useQuery({
    queryKey: ["tmdb-find", imdbId],
    queryFn: () => resolveImdb({ data: { imdbId } }),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="mt-4 h-8 w-96" />
      </PageShell>
    );
  }
  if (!q.data) {
    return (
      <PageShell>
        <EmptyState title="Movie not found" description="It might have been removed from your library." />
      </PageShell>
    );
  }
  const { movie, appearsIn } = q.data;
  const rating = parseRating(movie.rating);
  const votes = parseVotes(movie.votes);
  const year = primaryYear(movie.year);
  const genres = parseGenres(movie.genre);
  const backdrop = backdropUrl(tmdb.data?.backdropPath ?? null);
  const credits = movie.credits ?? {};

  return (
    <PageShell wide>
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1 body-sm text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <ChevronLeftIcon size={16} /> Back to Library
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-[24px] border border-[var(--hairline)]">
        <div
          className="h-56 w-full bg-cover bg-center md:h-80"
          style={{
            background: backdrop
              ? `linear-gradient(to top, rgba(10,26,26,0.85) 20%, rgba(10,26,26,0.3) 100%), url(${backdrop}) center/cover`
              : "linear-gradient(135deg, var(--surface-dark), var(--primary))",
          }}
        />
        <div className="flex flex-col gap-4 bg-[var(--surface-dark)] p-6 text-[var(--on-dark)] md:absolute md:inset-x-0 md:bottom-0 md:flex-row md:items-end md:bg-transparent md:p-8">
          <div className="w-28 shrink-0 overflow-hidden rounded-[16px] border border-white/10 aspect-[2/3]">
            <MoviePoster path={tmdb.data?.posterPath ?? null} title={movie.title} size="w342" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="display-md text-white">{movie.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 body-sm text-white/80">
              {year && <span>{year}</span>}
              {movie.type && <span>· {movie.type}</span>}
              {movie.duration && <span>· {movie.duration}</span>}
              {movie.content_rating && <span>· {movie.content_rating}</span>}
              {rating !== null && (
                <span className="inline-flex items-center gap-1">
                  · <StarIcon size={14} className="text-[var(--brand-ochre)]" />
                  <span className="font-semibold text-white">{rating.toFixed(1)}</span>
                  <span className="text-white/60">({votes.toLocaleString()})</span>
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span key={g} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] text-white">
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {movie.description && (
            <section>
              <h2 className="title-md mb-2">Synopsis</h2>
              <p className="body-md text-[var(--body)]">{movie.description}</p>
            </section>
          )}

          {credits &&
            (["Director", "Writers", "Producers", "Cast"] as const).map((role) => {
              const people = (credits as any)[role] as string[] | undefined;
              if (!people || people.length === 0) return null;
              return (
                <section key={role} className="mt-8">
                  <h2 className="title-md mb-3">{role}</h2>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                    {people.slice(0, 12).map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 rounded-[12px] border border-[var(--hairline)] p-3"
                      >
                        <PersonAvatar name={name} size={44} />
                        <div className="min-w-0">
                          <div className="title-sm truncate text-[var(--ink)]">{name}</div>
                          <div className="caption text-[var(--muted)]">
                            {role === "Cast" ? "Cast" : role.slice(0, -1)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>

        <aside className="space-y-6">
          {movie.keywords && movie.keywords.length > 0 && (
            <section>
              <h2 className="title-md mb-3">Keywords</h2>
              <div className="flex flex-wrap gap-1.5">
                {movie.keywords.slice(0, 40).map((k) => (
                  <Pill key={k} className="text-[11px]">
                    {k}
                  </Pill>
                ))}
              </div>
            </section>
          )}
          {appearsIn.length > 0 && (
            <section>
              <h2 className="title-md mb-3">Appears in</h2>
              <div className="flex flex-wrap gap-1.5">
                {appearsIn.map((l) => (
                  <Link key={l.id} to="/library/$listId" params={{ listId: l.id }}>
                    <Pill>{l.name}</Pill>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {movie.imdb_url && (
            <a
              href={movie.imdb_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--hairline)] px-4 py-2 body-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              View on IMDb <ExternalIcon size={14} />
            </a>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
