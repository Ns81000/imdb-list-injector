import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Pill } from "@/components/ui/pill";
import { SearchIcon } from "@/components/icons";
import { listMovies, listLists } from "@/lib/data.functions";
import { useMode } from "@/hooks/use-mode";
import { requireAuth } from "@/lib/route-auth";

export const Route = createFileRoute("/search")({
  // Finding #6: Check auth before component mount
  beforeLoad: async () => {
    await requireAuth();
  },
  head: () => ({
    meta: [
      { title: "Search — Zoom Out" },
      {
        name: "description",
        content: "Search movies, keywords, credits and lists across your Zoom Out library.",
      },
      { property: "og:title", content: "Search — Zoom Out" },
      {
        property: "og:description",
        content: "Search movies, keywords, credits and lists across your Zoom Out library.",
      },
    ],
  }),
  // Finding #5: Add loader to prefetch search data during route transition
  loader: async ({ context }) => {
    // Prefetch both movies and lists for default mode "watching"
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["movies", "watching"],
        queryFn: () => listMovies({ data: { mode: "watching" } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["lists-paginated", "watching"],
        queryFn: () => listMovies({ data: { mode: "watching" } }),
      }),
    ]);
  },
  component: () => (
    <AuthGate>
      <SearchPage />
    </AuthGate>
  ),
});

function SearchPage() {
  const { mode } = useMode();
  const moviesQ = useQuery({
    queryKey: ["movies", mode],
    queryFn: () => listMovies({ data: { mode } }),
  });
  const listsQ = useQuery({
    queryKey: ["lists", mode],
    queryFn: () => listLists({ data: { mode } }),
  });
  const [q, setQ] = useState("");
  const query = useDeferredValue(q).trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return null;
    const movies = (moviesQ.data ?? []).filter(
      (m) =>
        m.title.toLowerCase().includes(query) ||
        m.imdb_id.toLowerCase().includes(query) ||
        (m.description ?? "").toLowerCase().includes(query),
    );
    // dedupe movies by imdb_id
    const seen = new Set<string>();
    const uniqueMovies = movies.filter((m) =>
      seen.has(m.imdb_id) ? false : (seen.add(m.imdb_id), true),
    );
    const lists = (listsQ.data ?? []).filter((l) => l.name.toLowerCase().includes(query));
    const kwCounts = new Map<string, number>();
    for (const m of moviesQ.data ?? []) {
      for (const k of m.keywords ?? []) {
        if (k.toLowerCase().includes(query)) {
          kwCounts.set(k, (kwCounts.get(k) ?? 0) + 1);
        }
      }
    }
    const keywords = [...kwCounts.entries()].sort((a, b) => b[1] - a[1]);
    const peopleCounts = new Map<string, { count: number; role: string }>();
    for (const m of moviesQ.data ?? []) {
      for (const role of ["Director", "Writers", "Producers", "Cast"] as const) {
        for (const p of (m.credits?.[role] ?? []) as string[]) {
          if (p.toLowerCase().includes(query)) {
            const entry = peopleCounts.get(p) ?? { count: 0, role };
            entry.count++;
            peopleCounts.set(p, entry);
          }
        }
      }
    }
    const people = [...peopleCounts.entries()].sort((a, b) => b[1].count - a[1].count);
    return { movies: uniqueMovies, lists, keywords, people };
  }, [query, moviesQ.data, listsQ.data]);

  return (
    <PageShell>
      <div className="mb-6 hidden lg:block">
        <h1 className="display-md">Search</h1>
      </div>
      <div className="relative">
        <SearchIcon
          size={20}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search movies, keywords, people, lists…"
          className="h-14 pl-12 text-[17px]"
          autoFocus
        />
      </div>

      {!query && (
        <div className="mt-10">
          <EmptyState
            title="Start typing"
            description="Search across movies, keywords, credits and lists."
            showLogo={false}
          />
        </div>
      )}

      {results && (
        <div className="mt-8 space-y-10">
          <Section title={`Movies (${results.movies.length})`}>
            {results.movies.length === 0 ? (
              <p className="body-sm text-[var(--muted)]">No matching titles.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--hairline-soft)]">
                {results.movies.slice(0, 8).map((m) => (
                  <Link
                    key={m.imdb_id}
                    to="/movie/$imdbId"
                    params={{ imdbId: m.imdb_id }}
                    className="flex items-center gap-3 py-3 hover:bg-[var(--surface-soft)]"
                  >
                    <div className="title-sm text-[var(--ink)]">{m.title}</div>
                    <div className="ml-auto caption text-[var(--muted)]">
                      {m.year} · {m.rating ?? "—"}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Keywords (${results.keywords.length})`}>
            {results.keywords.length === 0 ? (
              <p className="body-sm text-[var(--muted)]">No matching keywords.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {results.keywords.slice(0, 30).map(([k, c]) => (
                  <Pill key={k}>
                    {k} · {c}
                  </Pill>
                ))}
              </div>
            )}
          </Section>

          <Section title={`People (${results.people.length})`}>
            {results.people.length === 0 ? (
              <p className="body-sm text-[var(--muted)]">No matching credits.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--hairline-soft)]">
                {results.people.slice(0, 12).map(([name, entry]) => (
                  <div key={name} className="flex items-center gap-3 py-3">
                    <div className="title-sm">{name}</div>
                    <div className="ml-auto caption text-[var(--muted)]">
                      {entry.role} · {entry.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={`Lists (${results.lists.length})`}>
            {results.lists.length === 0 ? (
              <p className="body-sm text-[var(--muted)]">No matching lists.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--hairline-soft)]">
                {results.lists.map((l) => (
                  <Link
                    key={l.id}
                    to="/library/$listId"
                    params={{ listId: l.id }}
                    className="flex items-center gap-3 py-3 hover:bg-[var(--surface-soft)]"
                  >
                    <div className="title-sm">{l.name}</div>
                    <div className="ml-auto caption text-[var(--muted)]">
                      {l.movie_count} titles
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="caption-upper mb-3 text-[var(--muted)]">{title}</h2>
      {children}
    </section>
  );
}
