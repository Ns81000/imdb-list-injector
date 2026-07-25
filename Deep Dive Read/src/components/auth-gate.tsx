import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { getAuthStatus } from "@/lib/auth.functions";
import { ZoomOutLogo } from "./brand/zoom-out-logo";

export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const q = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => getAuthStatus(),
    retry: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!q.data) return;
    if (!q.data.setup && path !== "/setup") {
      navigate({ to: "/setup", replace: true });
    } else if (q.data.setup && !q.data.authenticated && path !== "/login") {
      navigate({ to: "/login", replace: true });
    }
  }, [q.data, path, navigate]);

  if (q.isLoading || !q.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)]">
        <div className="zo-pulse">
          <ZoomOutLogo size={72} />
        </div>
      </div>
    );
  }
  if (!q.data.setup || !q.data.authenticated) {
    // Waiting for redirect.
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)]">
        <div className="zo-pulse">
          <ZoomOutLogo size={72} />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
