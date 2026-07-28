// App data fetching. All queries flow through the admin client (single-user app,
// tables are locked to service_role). Every server fn re-verifies the session.

import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import type { List, Mode, Movie, SyncStatusRow } from "@/types";

interface SessionData {
  authenticated?: boolean;
  since?: string;
}

async function requireAuth() {
  const { getSessionConfig } = await import("./auth.server");
  const session = await useSession<SessionData>(getSessionConfig());
  if (!session.data.authenticated) throw new Error("Unauthorized");
}

const modeSchema = z.object({ mode: z.enum(["watching", "watched"]) });

export const listLists = createServerFn({ method: "GET" })
  .inputValidator((data) => modeSchema.parse(data))
  .handler(async ({ data }): Promise<List[]> => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("lists")
      .select("id,name,url,movie_count,last_refreshed,mode,created_at,updated_at")
      .eq("mode", data.mode)
      .order("last_refreshed", { ascending: false, nullsFirst: false });
    if (res.error) throw res.error;
    return (res.data ?? []) as unknown as List[];
  });

// Finding #4: Paginated version of listLists with 30-item batches
export const listListsPaginated = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z
      .object({
        mode: z.enum(["watching", "watched"]),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ lists: List[]; hasMore: boolean }> => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("lists")
      .select("id,name,url,movie_count,last_refreshed,mode,created_at,updated_at")
      .eq("mode", data.mode)
      .order("last_refreshed", { ascending: false, nullsFirst: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (res.error) throw res.error;
    const lists = (res.data ?? []) as unknown as List[];
    const hasMore = lists.length === data.limit;
    return { lists, hasMore };
  });

export const listMovies = createServerFn({ method: "GET" })
  .inputValidator((data) => modeSchema.parse(data))
  .handler(async ({ data }): Promise<Movie[]> => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Distinct titles per imdb_id (naive: pull all rows in this mode, dedupe in JS)
    const res = await supabaseAdmin
      .from("movies")
      .select(
        "imdb_id,list_id,position,type,title,year,rating,votes,genre,content_rating,duration,description,imdb_url,keywords,credits,lists!inner(mode)",
      )
      .eq("lists.mode", data.mode);
    if (res.error) throw res.error;
    return (res.data ?? []) as unknown as Movie[];
  });

export const getList = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ listId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const list = await supabaseAdmin
      .from("lists")
      .select("id,name,url,movie_count,last_refreshed,mode,created_at,updated_at")
      .eq("id", data.listId)
      .maybeSingle();
    if (list.error) throw list.error;
    if (!list.data) return null;
    const movies = await supabaseAdmin
      .from("movies")
      .select(
        "imdb_id,list_id,position,type,title,year,rating,votes,genre,content_rating,duration,description,imdb_url,keywords,credits",
      )
      .eq("list_id", data.listId)
      .order("position", { ascending: true, nullsFirst: false });
    if (movies.error) throw movies.error;
    return {
      list: list.data as unknown as List,
      movies: (movies.data ?? []) as unknown as Movie[],
    };
  });

export const getMovie = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ imdbId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // First matching row for canonical metadata, and all lists it appears in.
    const rows = await supabaseAdmin
      .from("movies")
      .select(
        "imdb_id,list_id,position,type,title,year,rating,votes,genre,content_rating,duration,description,imdb_url,keywords,credits,lists!inner(id,name,mode)",
      )
      .eq("imdb_id", data.imdbId);
    if (rows.error) throw rows.error;
    if (!rows.data || rows.data.length === 0) return null;
    const primary = rows.data[0] as any;
    const appearsIn = rows.data.map((r: any) => ({
      id: r.lists.id,
      name: r.lists.name,
      mode: r.lists.mode,
    }));
    const { lists: _l, ...movie } = primary;
    void _l;
    return { movie: movie as Movie, appearsIn };
  });

export const getSyncStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    latest: SyncStatusRow | null;
    history: SyncStatusRow[];
  }> => {
    await requireAuth();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("sync_log")
      .select("synced_at,mode,lists_count,movies_count,status")
      .order("synced_at", { ascending: false })
      .limit(10);
    const rows = (res.data ?? []) as unknown as SyncStatusRow[];
    return { latest: rows[0] ?? null, history: rows };
  },
);

export const getStorageStats = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [lists, movies] = await Promise.all([
    supabaseAdmin.from("lists").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("movies").select("imdb_id", { count: "exact", head: true }),
  ]);
  return { lists: lists.count ?? 0, movies: movies.count ?? 0 };
});

export const exportAllData = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  
  // Finding #23: Fetch data in chunks to avoid timeout/memory issues on large datasets
  const CHUNK_SIZE = 1000;
  
  // Fetch all lists (usually small, no chunking needed)
  const listsRes = await supabaseAdmin.from("lists").select("*");
  if (listsRes.error) throw listsRes.error;
  
  // Fetch movies in chunks
  const allMovies: any[] = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const moviesRes = await supabaseAdmin
      .from("movies")
      .select("*")
      .range(offset, offset + CHUNK_SIZE - 1);
    
    if (moviesRes.error) throw moviesRes.error;
    
    const chunk = moviesRes.data ?? [];
    allMovies.push(...chunk);
    
    // If we got fewer than CHUNK_SIZE rows, we've reached the end
    hasMore = chunk.length === CHUNK_SIZE;
    offset += CHUNK_SIZE;
  }
  
  return {
    exported_at: new Date().toISOString(),
    lists: listsRes.data ?? [],
    movies: allMovies,
  };
});

export const clearAllData = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ password: z.string().min(1).max(256) }).parse(data))
  .handler(async ({ data }) => {
    await requireAuth();
    // Re-verify password: this is a fully destructive, irreversible action.
    const { verifyPassword } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "password_hash")
      .maybeSingle();
    if (!row.data?.value) throw new Error("No password set.");
    const ok = await verifyPassword(data.password, row.data.value);
    if (!ok) throw new Error("Password is incorrect.");
    await supabaseAdmin.from("movies").delete().not("imdb_id", "is", null);
    await supabaseAdmin.from("lists").delete().not("id", "is", null);
    await supabaseAdmin.from("sync_log").delete().not("id", "is", null);
    return { ok: true };
  });
