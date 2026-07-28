import { Link } from "@tanstack/react-router";
import { memo } from "react";
import type { Movie } from "@/types";
import { MoviePoster } from "./movie-poster";
import { Pill } from "../ui/pill";
import { StarIcon } from "../icons";
import { parseGenres, parseRating, primaryYear } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { resolveImdb } from "@/lib/tmdb.functions";

export const MovieCard = memo(function MovieCard({ movie }: { movie: Movie }) {
  const genres = parseGenres(movie.genre).slice(0, 2);
  const rating = parseRating(movie.rating);
  const year = primaryYear(movie.year);
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
      className="group flex flex-col overflow-hidden rounded-[16px] border border-[var(--hairline)] bg-[var(--canvas)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-[var(--surface-card)]">
        <MoviePoster path={q.data?.posterPath ?? null} title={movie.title} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="title-sm line-clamp-2 text-[var(--ink)]">{movie.title}</div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
          {year && <span>{year}</span>}
          {movie.type && <Pill className="text-[11px]">{movie.type}</Pill>}
          {rating !== null && (
            <span className="ml-auto inline-flex items-center gap-1 text-[var(--ink)]">
              <StarIcon size={13} className="text-[var(--brand-ochre)]" />
              <span className="font-semibold">{rating.toFixed(1)}</span>
            </span>
          )}
        </div>
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {genres.map((g) => (
              <Pill key={g} className="text-[11px]">
                {g}
              </Pill>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
});
