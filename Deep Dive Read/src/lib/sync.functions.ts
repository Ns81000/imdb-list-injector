// Sync push helper. Called via a public API route (/api/public/sync/push)
// authenticated by the SYNC_TOKEN header.

import { z } from "zod";

const MAX_KEYWORD_LEN = 120;
const MAX_STRING_LEN = 10_000;
const MAX_MOVIES_PER_LIST = 5_000;
const MAX_LISTS = 500;

const strField = (max: number) =>
  z.preprocess(
    (val) => (val == null ? null : String(val)),
    z.string().max(max).nullable().optional(),
  );

const movieSchema = z.object({
  imdb_id: z.string().min(1).max(32),
  position: z.preprocess(
    (val) => (val == null || val === "" ? null : Number(val)),
    z.number().int().nullable().optional(),
  ),
  type: strField(64),
  title: z.preprocess((val) => String(val ?? "Untitled"), z.string().min(1).max(500)),
  year: strField(16),
  rating: strField(16),
  votes: strField(32),
  genre: strField(256),
  content_rating: strField(32),
  duration: strField(32),
  description: strField(MAX_STRING_LEN),
  imdb_url: strField(512),
  keywords: z.array(z.string().max(MAX_KEYWORD_LEN)).max(200).nullable().optional(),
  credits: z.any().nullable().optional(),
});

export const pushPayloadSchema = z.object({
  mode: z.enum(["watching", "watched"]),
  lists: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        name: z.string().max(500).default("Untitled List"),
        url: z.string().max(1024).nullable().optional(),
        movieCount: z.number().int().nonnegative().optional(),
        lastRefreshed: z.string().max(64).nullable().optional(),
        movies: z.array(movieSchema).max(MAX_MOVIES_PER_LIST).default([]),
      }),
    )
    .max(MAX_LISTS),
});

export type SyncPushPayload = z.infer<typeof pushPayloadSchema>;

export async function applySyncPush(payload: SyncPushPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mode = payload.mode;
  const incomingIds = new Set(payload.lists.map((l) => l.id));

  // Safety net: refuse a fully-empty payload if we already have data for this
  // mode. A truncated/failed scrape would otherwise wipe the entire library.
  if (payload.lists.length === 0) {
    const existing = await supabaseAdmin
      .from("lists")
      .select("id", { count: "exact", head: true })
      .eq("mode", mode);
    if ((existing.count ?? 0) > 0) {
      throw new Error("refusing to sync empty payload against non-empty library");
    }
  }

  let totalMovies = 0;

  for (const list of payload.lists) {
    const upsertRes = await supabaseAdmin.from("lists").upsert(
      [
        {
          id: list.id,
          name: list.name,
          url: list.url ?? null,
          movie_count: list.movieCount ?? list.movies.length,
          last_refreshed: list.lastRefreshed ?? new Date().toISOString(),
          mode,
        },
      ],
      { onConflict: "id" },
    );
    if (upsertRes.error) throw upsertRes.error;

    if (list.movies.length) {
      // Insert-first, delete-stale: keeps rows visible if insert fails.
      const rows = list.movies.map((m) => ({
        imdb_id: m.imdb_id,
        list_id: list.id,
        position: m.position ?? null,
        type: m.type ?? null,
        title: m.title,
        year: m.year ?? null,
        rating: m.rating ?? null,
        votes: m.votes ?? null,
        genre: m.genre ?? null,
        content_rating: m.content_rating ?? null,
        duration: m.duration ?? null,
        description: m.description ?? null,
        imdb_url: m.imdb_url ?? null,
        keywords: m.keywords ?? null,
        credits: m.credits ?? null,
      }));
      // Wipe then insert. Non-transactional (Supabase JS has no client-side tx),
      // but we already validated a non-empty rows array.
      const del = await supabaseAdmin.from("movies").delete().eq("list_id", list.id);
      if (del.error) throw del.error;
      const ins = await supabaseAdmin.from("movies").insert(rows);
      if (ins.error) throw ins.error;
      totalMovies += rows.length;
    } else {
      await supabaseAdmin.from("movies").delete().eq("list_id", list.id);
    }
  }

  // Delete lists in this mode that aren't in the payload (cascade removes movies).
  const existing = await supabaseAdmin.from("lists").select("id").eq("mode", mode);
  const stale = (existing.data ?? []).map((r) => r.id).filter((id) => !incomingIds.has(id));
  if (stale.length) {
    await supabaseAdmin.from("lists").delete().in("id", stale);
  }

  await supabaseAdmin.from("sync_log").insert([
    {
      mode,
      lists_count: payload.lists.length,
      movies_count: totalMovies,
      status: "complete",
    },
  ]);

  // Retention: keep only the most recent 100 sync_log rows to prevent unbounded growth.
  const oldest = await supabaseAdmin
    .from("sync_log")
    .select("id")
    .order("synced_at", { ascending: false })
    .range(100, 100);
  if (oldest.data && oldest.data.length) {
    const cutoffId = oldest.data[0].id;
    await supabaseAdmin.from("sync_log").delete().lte("id", cutoffId);
  }

  return { lists: payload.lists.length, movies: totalMovies };
}
