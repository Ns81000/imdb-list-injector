import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/library/list-card";
import { listLists, listMovies } from "@/lib/data.functions";
import { useMode } from "@/hooks/use-mode";
import { SearchIcon } from "@/components/icons";

export const Route = createFileRoute("/library/")({
  head: () => ({
    meta: [
      { title: "Library — Zoom Out" },
      { name: "description", content: "Browse every list you've saved with Zoom Out." },
      { property: "og:title", content: "Library — Zoom Out" },
      { property: "og:description", content: "Browse every list you've saved with Zoom Out." },
    ],
  }),
  component: () => (
    <AuthGate>
      <LibraryPage />
    </AuthGate>
  ),
});

function LibraryPage() {
  const { mode } = useMode();
  const listsQ = useQuery({ queryKey: ["lists", mode], queryFn: () => listLists({ data: { mode } }) });
  const moviesQ = useQuery({ queryKey: ["movies", mode], queryFn: () => listMovies({ data: { mode } }) });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recent");

  const moviesByList = useMemo(() => {
    const map = new Map<string, typeof moviesQ.data>();
    for (const m of moviesQ.data ?? []) {
      const arr = (map.get(m.list_id) ?? []) as any[];
      arr.push(m);
      map.set(m.list_id, arr as any);
    }
    return map;
  }, [moviesQ.data]);

  const filtered = useMemo(() => {
    const list = [...(listsQ.data ?? [])].filter((l) => l.name.toLowerCase().includes(q.toLowerCase()));
    switch (sort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "count":
        list.sort((a, b) => b.movie_count - a.movie_count);
        break;
      case "oldest":
        list.sort(
          (a, b) =>
            new Date(a.last_refreshed ?? 0).getTime() - new Date(b.last_refreshed ?? 0).getTime(),
        );
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.last_refreshed ?? 0).getTime() - new Date(a.last_refreshed ?? 0).getTime(),
        );
    }
    return list;
  }, [listsQ.data, q, sort]);

  return (
    <PageShell>
      <div className="mb-6 hidden lg:block">
        <h1 className="display-md">Library</h1>
      </div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-md">
          <SearchIcon
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lists"
            className="pl-10"
          />
        </div>
        <div className="w-full md:w-56">
          <Select
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: "Recently updated" },
              { value: "name", label: "Name A–Z" },
              { value: "count", label: "Most titles" },
              { value: "oldest", label: "Oldest" },
            ]}
          />
        </div>
      </div>

      {listsQ.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No lists found"
          description={q ? "Try clearing your search term." : "Import your first IMDb list to start."}
          action={
            q ? { label: "Clear search", onClick: () => setQ("") } : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <ListCard key={l.id} list={l} movies={(moviesByList.get(l.id) ?? []) as any} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
