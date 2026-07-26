import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ToastProvider } from "@/components/ui/toast";
import { ModeProvider } from "@/hooks/use-mode";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="max-w-md text-center">
        <h1 className="display-lg text-[var(--ink)]">404</h1>
        <h2 className="mt-4 title-md text-[var(--ink)]">Page not found</h2>
        <p className="mt-2 body-sm text-[var(--muted)]">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex h-[44px] items-center justify-center rounded-[12px] bg-[var(--primary)] px-5 button-label text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4">
      <div className="max-w-md text-center">
        <h1 className="title-md text-[var(--ink)]">This page didn't load</h1>
        <p className="mt-2 body-sm text-[var(--muted)]">
          Something went wrong. Try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-[44px] items-center rounded-[12px] bg-[var(--primary)] px-5 button-label text-[var(--on-primary)] hover:bg-[var(--primary-active)]"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-[44px] items-center rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] px-5 button-label text-[var(--ink)] hover:bg-[var(--surface-soft)]"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zoom Out — Movie Library Analytics" },
      {
        name: "description",
        content:
          "Your personal movie library analytics dashboard. Explore lists, ratings, credits and keywords from your saved IMDb titles.",
      },
      { name: "author", content: "Zoom Out" },
      { name: "theme-color", content: "#fffaf0" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { property: "og:title", content: "Zoom Out — Movie Library Analytics" },
      { property: "og:description", content: "Your personal movie library analytics dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ModeProvider>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
}
