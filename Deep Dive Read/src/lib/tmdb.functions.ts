import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

// Client-safe wrapper around TMDB helpers. Every call funnels through the
// server and requires an authenticated session so anonymous callers can't
// burn our TMDB quota.

interface SessionData {
  authenticated?: boolean;
}

async function requireAuth() {
  const { getSessionConfig } = await import("./auth.server");
  const session = await useSession<SessionData>(getSessionConfig());
  if (!session.data.authenticated) throw new Error("Unauthorized");
}

export const resolveImdb = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ imdbId: z.string().min(1).max(32) }).parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const { tmdbFindByImdb } = await import("./tmdb.server");
    return tmdbFindByImdb(data.imdbId);
  });

export const searchPerson = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ name: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const { tmdbSearchPerson } = await import("./tmdb.server");
    return tmdbSearchPerson(data.name);
  });
