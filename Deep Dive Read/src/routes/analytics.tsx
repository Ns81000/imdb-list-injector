import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ActorLeaderboard,
  ContentRatingDonut,
  DirectorLeaderboard,
  GenreRatingLeaderboard,
  KeywordCloud,
  QualityVsPopularity,
  RuntimeDistribution,
  TypeBars,
  WriterLeaderboard,
} from "@/components/charts";
import { listMovies } from "@/lib/data.functions";
import { useMode } from "@/hooks/use-mode";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Zoom Out" },
      { name: "description", content: "Deep charts across your Zoom Out library." },
      { property: "og:title", content: "Analytics — Zoom Out" },
      { property: "og:description", content: "Deep charts across your Zoom Out library." },
    ],
  }),
  component: () => (
    <AuthGate>
      <AnalyticsPage />
    </AuthGate>
  ),
});

function AnalyticsPage() {
  const { mode } = useMode();
  const q = useQuery({ queryKey: ["movies", mode], queryFn: () => listMovies({ data: { mode } }) });
  const movies = q.data ?? [];

  if (q.isLoading) {
    return (
      <PageShell>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </PageShell>
    );
  }
  if (movies.length === 0) {
    return (
      <PageShell>
        <EmptyState title="No data yet" description="Sync some IMDb lists to see analytics." />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-6 hidden lg:block">
        <h1 className="display-md">Analytics</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg mb-4">Quality vs Popularity</h2>
          <QualityVsPopularity movies={movies} height={310} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Highest Rated Genres</h2>
          <GenreRatingLeaderboard movies={movies} top={5} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Runtime</h2>
          <RuntimeDistribution movies={movies} height={220} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Content Rating</h2>
          <ContentRatingDonut movies={movies} height={200} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg mb-4">Type</h2>
          <TypeBars movies={movies} height={260} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Director Leaderboard</h2>
          <DirectorLeaderboard movies={movies} top={5} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg mb-4">Top Actors</h2>
          <ActorLeaderboard movies={movies} top={10} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Top Writers</h2>
          <WriterLeaderboard movies={movies} top={10} />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="title-lg mb-4">Keyword Cloud</h2>
        <KeywordCloud movies={movies} />
      </Card>
    </PageShell>
  );
}
