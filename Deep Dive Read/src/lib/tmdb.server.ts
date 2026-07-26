// Server-only TMDB helpers with a tiny in-memory LRU cache.

type CacheEntry<T> = { value: T; expires: number };
const MAX_ENTRIES = 5000;
const TTL_HIT_MS = 24 * 60 * 60 * 1000; // successful hit — poster/backdrop stable
const TTL_EMPTY_MS = 60 * 60 * 1000; // negative result — retry within an hour

const findCache = new Map<string, CacheEntry<unknown>>();
const personCache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(store: Map<string, CacheEntry<unknown>>, key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return null;
  }
  // touch for LRU
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
}

function cacheSet<T>(
  store: Map<string, CacheEntry<unknown>>,
  key: string,
  value: T,
  ttl: number = TTL_HIT_MS,
) {
  store.set(key, { value, expires: Date.now() + ttl });
  while (store.size > MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey === undefined) break;
    store.delete(firstKey);
  }
}

function tmdbHeaders(): { auth: HeadersInit; keyParam: string | null } {
  const key = process.env.TMDB_API_KEY;
  if (!key) return { auth: {}, keyParam: null };
  // v4 read tokens are long JWTs; v3 keys are 32-char hex. Detect on both.
  if (key.length > 60 && key.split(".").length === 3) {
    return { auth: { Authorization: `Bearer ${key}` }, keyParam: null };
  }
  return { auth: {}, keyParam: key };
}

async function tmdbFetch(pathAndQuery: string): Promise<Response> {
  const { auth, keyParam } = tmdbHeaders();
  const url = new URL(`https://api.themoviedb.org/3${pathAndQuery}`);
  if (keyParam) url.searchParams.set("api_key", keyParam);
  if (!url.searchParams.has("language")) url.searchParams.set("language", "en-US");
  return fetch(url.toString(), { headers: { accept: "application/json", ...auth } });
}

export interface TmdbResolveResult {
  imdbId: string;
  tmdbId: number | null;
  mediaType: "movie" | "tv" | null;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  hasImages: boolean;
}

export async function tmdbFindByImdb(imdbId: string): Promise<TmdbResolveResult> {
  const cached = cacheGet<TmdbResolveResult>(findCache, imdbId);
  if (cached) return cached;

  const empty: TmdbResolveResult = {
    imdbId,
    tmdbId: null,
    mediaType: null,
    title: "",
    posterPath: null,
    backdropPath: null,
    overview: "",
    hasImages: false,
  };

  if (!process.env.TMDB_API_KEY) return empty;

  try {
    const res = await tmdbFetch(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`);
    if (!res.ok) {
      cacheSet(findCache, imdbId, empty, TTL_EMPTY_MS);
      return empty;
    }
    const json: any = await res.json();
    let hit: any = null;
    let mediaType: "movie" | "tv" | null = null;
    if (json.movie_results?.length) {
      hit = json.movie_results[0];
      mediaType = "movie";
    } else if (json.tv_results?.length) {
      hit = json.tv_results[0];
      mediaType = "tv";
    }
    const result: TmdbResolveResult = hit
      ? {
          imdbId,
          tmdbId: hit.id ?? null,
          mediaType,
          title: hit.title ?? hit.name ?? "",
          posterPath: hit.poster_path ?? null,
          backdropPath: hit.backdrop_path ?? null,
          overview: hit.overview ?? "",
          hasImages: Boolean(hit.poster_path || hit.backdrop_path),
        }
      : empty;
    cacheSet(findCache, imdbId, result, hit ? TTL_HIT_MS : TTL_EMPTY_MS);
    return result;
  } catch {
    return empty;
  }
}

export interface TmdbPersonResult {
  name: string;
  tmdbId: number | null;
  profilePath: string | null;
  knownFor: string;
}

export async function tmdbSearchPerson(name: string): Promise<TmdbPersonResult> {
  const key = name.trim().toLowerCase();
  const cached = cacheGet<TmdbPersonResult>(personCache, key);
  if (cached) return cached;

  const empty: TmdbPersonResult = { name, tmdbId: null, profilePath: null, knownFor: "" };
  if (!process.env.TMDB_API_KEY || !key) return empty;

  try {
    const res = await tmdbFetch(`/search/person?query=${encodeURIComponent(name)}`);
    if (!res.ok) {
      cacheSet(personCache, key, empty, TTL_EMPTY_MS);
      return empty;
    }
    const json: any = await res.json();
    const p = json.results?.[0];
    const result: TmdbPersonResult = p
      ? {
          name: p.name ?? name,
          tmdbId: p.id ?? null,
          profilePath: p.profile_path ?? null,
          knownFor: p.known_for_department ?? "",
        }
      : empty;
    cacheSet(personCache, key, result, p ? TTL_HIT_MS : TTL_EMPTY_MS);
    return result;
  } catch {
    return empty;
  }
}

// Only TMDB's documented image path shapes are allowed. This blocks arbitrary
// path traversal, hides host-side error details, and prevents the proxy from
// being abused as a generic image relay against TMDB's CDN.
const TMDB_IMAGE_PATH =
  /^(?:original|w45|w92|w154|w185|w300|w342|w500|w780|w1280|h632)\/[A-Za-z0-9]{5,}\.(?:jpg|png|webp)$/;

export async function tmdbImageProxy(path: string): Promise<Response> {
  const clean = path.replace(/^\/+/, "");
  if (!TMDB_IMAGE_PATH.test(clean)) {
    return new Response("Bad path", { status: 400 });
  }
  const url = `https://image.tmdb.org/t/p/${clean}`;
  const upstream = await fetch(url);
  if (!upstream.ok) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  headers.set("content-type", contentType);
  headers.set("cache-control", "public, max-age=2592000, immutable");
  return new Response(upstream.body, { status: 200, headers });
}
