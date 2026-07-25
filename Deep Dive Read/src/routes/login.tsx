import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomOutLogo } from "@/components/brand/zoom-out-logo";
import { getAuthStatus, login } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Zoom Out" },
      { name: "description", content: "Unlock your Zoom Out dashboard." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["auth-status"], queryFn: () => getAuthStatus(), retry: false });
  const [password, setPassword] = useState("");
  const [shake, setShake] = useState(false);
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: (pw: string) => login({ data: { password: pw } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth-status"] });
      navigate({ to: "/", replace: true });
    },
    onError: () => {
      setError("Wrong password");
      setShake(true);
      setTimeout(() => setShake(false), 400);
    },
  });

  useEffect(() => {
    if (!status.data) return;
    if (!status.data.setup) navigate({ to: "/setup", replace: true });
    else if (status.data.authenticated) navigate({ to: "/", replace: true });
  }, [status.data, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto w-fit">
          <ZoomOutLogo size={72} />
        </div>
        <h1 className="mt-4 display-sm">Zoom Out</h1>
        <p className="mt-2 body-sm text-[var(--muted)]">Enter your password to continue</p>
        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (password.length === 0) return;
            m.mutate(password);
          }}
        >
          <Input
            type="password"
            placeholder="Password"
            value={password}
            error={Boolean(error)}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            className={shake ? "zo-shake" : ""}
            autoFocus
          />
          {error && <div className="body-sm text-left text-[var(--error)]">{error}</div>}
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
