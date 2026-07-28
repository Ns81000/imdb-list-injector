import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { changePassword, logout, getSessionInfo } from "@/lib/auth.functions";
import { clearAllData, exportAllData, getStorageStats } from "@/lib/data.functions";
import { relativeTime } from "@/lib/utils";
import { statusColor, useSyncStatus } from "@/hooks/use-sync-status";
import { requireAuth } from "@/lib/route-auth";

export const Route = createFileRoute("/settings")({
  // Finding #6: Check auth before component mount
  beforeLoad: async () => {
    await requireAuth();
  },
  head: () => ({
    meta: [
      { title: "Settings — Zoom Out" },
      { name: "description", content: "Manage your Zoom Out account, sync, and data." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <AuthGate>
      <SettingsPage />
    </AuthGate>
  ),
});

function SettingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const info = useQuery({ queryKey: ["session-info"], queryFn: () => getSessionInfo() });
  const stats = useQuery({ queryKey: ["storage-stats"], queryFn: () => getStorageStats() });
  const sync = useSyncStatus();

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: () => changePassword({ data: { currentPassword: cur, newPassword: next } }),
    onSuccess: () => {
      toast.show("Password updated", "success");
      setCur("");
      setNext("");
      setConfirm("");
    },
    onError: (e: any) => toast.show(e?.message ?? "Update failed", "error"),
  });

  const [clearOpen, setClearOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const clear = useMutation({
    mutationFn: () => clearAllData({ data: { password: clearPassword } }),
    onSuccess: () => {
      toast.show("All data cleared", "success");
      qc.invalidateQueries();
      setClearOpen(false);
      setClearPassword("");
    },
    onError: (e: any) => toast.show(e?.message ?? "Clear failed", "error"),
  });

  const doLogout = useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      await qc.invalidateQueries();
      navigate({ to: "/login", replace: true });
    },
  });

  async function doExport() {
    const data = await exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zoom-out-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show("Exported backup", "success");
  }

  return (
    <PageShell>
      <div className="mb-6 hidden lg:block">
        <h1 className="display-md">Settings</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="title-lg">Account</h2>
          <div className="mt-2 caption text-[var(--muted)]">
            Logged in since {info.data?.since ? relativeTime(info.data.since) : "—"}
          </div>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (next.length < 8)
                return toast.show("Password must be at least 8 characters", "error");
              if (next !== confirm) return toast.show("Passwords do not match", "error");
              change.mutate();
            }}
          >
            <Input
              placeholder="Current password"
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
            />
            <Input
              placeholder="New password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <Input
              placeholder="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={change.isPending}>
                Change password
              </Button>
              <Button type="button" variant="ghost" onClick={() => doLogout.mutate()}>
                Sign out
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="title-lg">Sync</h2>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: statusColor(sync.status) }}
            />
            <span className="body-sm text-[var(--body)]">
              {sync.latest ? `Last sync ${relativeTime(sync.latest.synced_at)}` : "No syncs yet"}
            </span>
          </div>
          <div className="mt-6">
            <h3 className="caption-upper mb-2 text-[var(--muted)]">Recent syncs</h3>
            {sync.history.length ? (
              <div className="max-h-64 divide-y divide-[var(--hairline-soft)] overflow-y-auto">
                {sync.history.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 body-sm">
                    <span className="text-[var(--muted)]">{relativeTime(s.synced_at)}</span>
                    <span className="caption ml-auto rounded-full bg-[var(--surface-card)] px-2 py-0.5">
                      {s.mode}
                    </span>
                    <span className="caption text-[var(--muted)]">
                      {s.lists_count ?? 0} lists · {s.movies_count ?? 0} movies
                    </span>
                    <span
                      className="caption uppercase"
                      style={{ color: s.status === "complete" ? "var(--success)" : "var(--error)" }}
                    >
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="body-sm text-[var(--muted)]">
                Install the Chrome extension and point it at this app to start syncing.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="title-lg">Data</h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <Stat label="Lists" value={stats.data?.lists ?? 0} />
            <Stat label="Movies" value={stats.data?.movies ?? 0} />
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={doExport}>
              Export JSON
            </Button>
            <Button variant="danger" onClick={() => setClearOpen(true)}>
              Clear all data
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="title-lg">About</h2>
          <p className="mt-3 body-sm text-[var(--body)]">
            Zoom Out — Personal movie library analytics dashboard, paired with the Zoom Out Chrome
            extension.
          </p>
          <p className="mt-2 caption text-[var(--muted)]">Version 1.0</p>
        </Card>
      </div>

      <Modal
        open={clearOpen}
        onClose={() => {
          setClearOpen(false);
          setClearPassword("");
        }}
        title="Clear all data?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setClearOpen(false);
                setClearPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => clear.mutate()}
              disabled={clear.isPending || clearPassword.length === 0}
            >
              {clear.isPending ? "Clearing…" : "Yes, delete everything"}
            </Button>
          </>
        }
      >
        <p className="body-sm text-[var(--body)]">
          This deletes all lists, movies, and sync history. Your password and account settings
          remain. This can't be undone.
        </p>
        <div className="mt-4">
          <Input
            type="password"
            placeholder="Enter your password to confirm"
            value={clearPassword}
            onChange={(e) => setClearPassword(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-soft)] p-4">
      <div className="caption-upper text-[var(--muted)]">{label}</div>
      <div className="mt-1 display-sm">{value}</div>
    </div>
  );
}
