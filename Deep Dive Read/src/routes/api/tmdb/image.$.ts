import { createFileRoute } from "@tanstack/react-router";
import { tmdbImageProxy } from "@/lib/tmdb.server";

export const Route = createFileRoute("/api/tmdb/image/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        if (!path) return new Response("Missing path", { status: 400 });
        return tmdbImageProxy(path);
      },
    },
  },
});
