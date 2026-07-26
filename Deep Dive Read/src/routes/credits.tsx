import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonCard } from "@/components/credits/person-card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { listMovies } from "@/lib/data.functions";
import { useMode } from "@/hooks/use-mode";
import type { Movie } from "@/types";
import { PersonAvatar } from "@/components/credits/person-card";

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

function CreditsPage() {
  const { mode } = useMode();
  const q = useQuery({ queryKey: ["movies", mode], queryFn: () => listMovies({ data: { mode } }) });
  const [role, setRole] = useState<Role>("Director");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
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
                onClick={() => setSelected(name)}
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

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ?? ""}>
        {selectedEntry && (
          <div>
            <div className="flex items-center gap-4">
              <PersonAvatar name={selected!} size={80} />
              <div>
                <div className="title-lg">{selected}</div>
                <div className="caption text-[var(--muted)]">
                  {selectedEntry.count} title{selectedEntry.count === 1 ? "" : "s"} · {role}
                </div>
              </div>
            </div>
            <div className="mt-6 max-h-96 overflow-y-auto divide-y divide-[var(--hairline-soft)]">
              {selectedEntry.titles.map((m) => (
                <Link
                  key={m.imdb_id}
                  to="/movie/$imdbId"
                  params={{ imdbId: m.imdb_id }}
                  className="flex items-center gap-3 py-3 hover:bg-[var(--surface-soft)]"
                >
                  <div className="title-sm">{m.title}</div>
                  <div className="ml-auto caption text-[var(--muted)]">{m.year}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
