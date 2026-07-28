import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Singleton QueryClient on client; fresh per-request on server
let clientQueryClient: QueryClient | undefined;

export const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: fresh QueryClient per request (SSR isolation, no data leak between users)
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000, // 1 minute
          gcTime: 5 * 60_000, // 5 minutes
          retry: 1,
        },
      },
    });
  }

  // Client: singleton QueryClient (persists across navigations, survives HMR)
  if (!clientQueryClient) {
    clientQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000, // 1 minute
          gcTime: 5 * 60_000, // 5 minutes in memory
          retry: 1,
        },
      },
    });
  }
  return clientQueryClient;
};

export const getRouter = () => {
  const queryClient = getQueryClient();

  // IMPORTANT: Do not memoize or cache this function's return value on the server.
  // Each SSR request must get a fresh router with a fresh QueryClient to prevent
  // data leakage between users. The current implementation is safe because TanStack
  // Start calls this function fresh per request.
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 60_000, // Treat preloaded data as fresh for 1 minute
  });

  return router;
};
