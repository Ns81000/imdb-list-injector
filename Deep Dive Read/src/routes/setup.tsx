import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomOutLogo } from "@/components/brand/zoom-out-logo";
import { getAuthStatus, setupPassword } from "@/lib/auth.functions";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up Zoom Out" },
      { name: "description", content: "Create a password to secure your Zoom Out dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => getAuthStatus(),
    retry: false,
  });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const m = useMutation({
    mutationFn: (p: string) => setupPassword({ data: { password: p } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth-status"] });
      navigate({ to: "/", replace: true });
    },
    onError: (e: any) => setErr(e?.message ?? "Setup failed"),
  });

  useEffect(() => {
    if (status.data?.setup) navigate({ to: "/login", replace: true });
  }, [status.data, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto w-fit">
            <ZoomOutLogo size={72} />
          </div>
          <h1 className="mt-4 display-sm">Welcome</h1>
          <p className="mt-2 body-sm text-[var(--muted)]">
            Create a password for your Zoom Out dashboard.
          </p>
        </div>
        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErr("");
            if (pw.length < 8) return setErr("Password must be at least 8 characters.");
            if (pw !== pw2) return setErr("Passwords do not match.");
            m.mutate(pw);
          }}
        >
          <Input
            type="password"
            placeholder="New password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
          />
          <Input
            type="password"
            placeholder="Confirm password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          {err && <div className="body-sm text-[var(--error)]">{err}</div>}
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Creating…" : "Create password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
