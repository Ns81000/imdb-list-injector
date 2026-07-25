import { useQuery } from "@tanstack/react-query";
import { getSyncStatus } from "@/lib/data.functions";
import { relativeTime } from "@/lib/utils";

type Status = "synced" | "aging" | "stale" | "error" | "never";

export function useSyncStatus() {
  const q = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => getSyncStatus(),
    refetchInterval: 30_000,
    retry: false,
  });
  const latest = q.data?.latest ?? null;
  let status: Status = "never";
  if (latest) {
    if (latest.status === "error") status = "error";
    else {
      const age = Date.now() - new Date(latest.synced_at).getTime();
      if (age < 5 * 60 * 1000) status = "synced";
      else if (age < 60 * 60 * 1000) status = "aging";
      else status = "stale";
    }
  }
  return {
    status,
    tooltip: latest ? `Last synced ${relativeTime(latest.synced_at)}` : "No syncs yet",
    latest,
    history: q.data?.history ?? [],
  };
}

export function statusColor(s: Status): string {
  if (s === "synced") return "var(--success)";
  if (s === "aging") return "var(--warning)";
  if (s === "error") return "var(--error)";
  if (s === "stale") return "var(--muted)";
  return "var(--muted-soft)";
}
