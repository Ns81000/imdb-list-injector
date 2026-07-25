import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ContentRatingDonut,
  DirectorLeaderboard,
  GenreBars,
  KeywordCloud,
  RatingHistogram,
  RuntimeDistribution,
  TypeBars,
  YearTimeline,
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
          <h2 className="title-lg mb-4">Rating Distribution</h2>
          <RatingHistogram movies={movies} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Release Year</h2>
          <YearTimeline movies={movies} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Runtime</h2>
          <RuntimeDistribution movies={movies} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Content Rating</h2>
          <ContentRatingDonut movies={movies} />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="title-lg mb-4">Top Genres</h2>
        <GenreBars movies={movies} top={20} height={520} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg mb-4">Type</h2>
          <TypeBars movies={movies} />
        </Card>
        <Card>
          <h2 className="title-lg mb-4">Director Leaderboard</h2>
          <DirectorLeaderboard movies={movies} />
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="title-lg mb-4">Keyword Cloud</h2>
        <KeywordCloud movies={movies} />
      </Card>
    </PageShell>
  );
}
