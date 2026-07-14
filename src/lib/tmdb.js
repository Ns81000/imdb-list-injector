// src/lib/tmdb.js
//
// Minimal TMDB client for the immersive player. One network round-trip per
// title: `/3/find/{imdb_id}` resolves poster + backdrop + overview in a single
// response. Results are cached in chrome.storage.local (keyed by imdb_id) with a
// TTL so re-launching a list is instant and API-free.
//
// Exposes globalThis.ImmersiveTmdb.

(function () {
  'use strict';

  const API_BASE = 'https://api.themoviedb.org/3';
  const IMG_BASE = 'https://image.tmdb.org/t/p';
  const CACHE_KEY = 'imdb_tmdb_cache';
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const CACHE_MAX = 12000;

  const IMAGES_CACHE_KEY = 'imdb_tmdb_images_cache';
  const IMAGES_CACHE_MAX = 4000;

  // v4 read tokens are long JWTs ("ey..."); v3 keys are 32-char hex.
  function authFor(key) {
    const isBearer = key.startsWith('ey') || key.length > 60;
    return isBearer
      ? { headers: { Authorization: `Bearer ${key}`, accept: 'application/json' }, query: '' }
      : { headers: { accept: 'application/json' }, query: `&api_key=${encodeURIComponent(key)}` };
  }

  function imageUrl(path, size) {
    return path ? `${IMG_BASE}/${size}${path}` : null;
  }

  // --- Cache (batched read once, writes debounced) -------------------------
  // Factory so the title-resolve cache and the per-title images cache share
  // identical batching/eviction behavior without duplicating it.

  function makeCache(storageKey, max) {
    let cache = null;
    let cacheLoad = null;
    let writeTimer = null;

    function load() {
      if (cache) return Promise.resolve(cache);
      if (cacheLoad) return cacheLoad;
      cacheLoad = new Promise((resolve) => {
        chrome.storage.local.get(storageKey, (data) => {
          cache = (data && data[storageKey] && typeof data[storageKey] === 'object') ? data[storageKey] : {};
          resolve(cache);
        });
      });
      return cacheLoad;
    }

    function scheduleWrite() {
      if (writeTimer) return;
      writeTimer = setTimeout(() => {
        writeTimer = null;
        if (!cache) return;
        // Evict oldest entries if the cache grows unbounded.
        const keys = Object.keys(cache);
        if (keys.length > max) {
          keys
            .sort((a, b) => (cache[a].at || 0) - (cache[b].at || 0))
            .slice(0, keys.length - max)
            .forEach((k) => delete cache[k]);
        }
        chrome.storage.local.set({ [storageKey]: cache });
      }, 800);
    }

    async function get(key) {
      const c = await load();
      const hit = c[key];
      if (!hit) return null;
      if (Date.now() - (hit.at || 0) > CACHE_TTL_MS) return null;
      return hit.data;
    }

    async function put(key, data) {
      const c = await load();
      c[key] = { at: Date.now(), data };
      scheduleWrite();
    }

    return { get, put };
  }

  const titleCache = makeCache(CACHE_KEY, CACHE_MAX);
  const imagesCache = makeCache(IMAGES_CACHE_KEY, IMAGES_CACHE_MAX);

  const getCached = (imdbId) => titleCache.get(imdbId);
  const putCached = (imdbId, data) => titleCache.put(imdbId, data);

  // --- Fetch ---------------------------------------------------------------

  // Validate a key with a cheap authenticated call. Returns true/false.
  async function validateKey(key) {
    if (!key) return false;
    const auth = authFor(key);
    try {
      const res = await fetch(`${API_BASE}/configuration?${auth.query.slice(1)}`, { headers: auth.headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Resolve one title. `preferredType` ('movie' | 'tv') only breaks ties when
  // both movie and tv results exist. Returns a normalized object with
  // posterUrl/backdropUrl/overview, or an object with hasImages:false when TMDB
  // has no images for it. Throws only on hard network/API errors so the caller
  // can retry.
  async function resolve(imdbId, key, preferredType, signal) {
    const cached = await getCached(imdbId);
    if (cached) return cached;

    const auth = authFor(key);
    const url = `${API_BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id&language=en-US${auth.query}`;
    const res = await fetch(url, { headers: auth.headers, signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 1;
      const err = new Error('rate-limited');
      err.retryAfter = retryAfter;
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`TMDB ${res.status}`);
      err.status = res.status;
      // 401 = bad/expired v3 key or v4 token; 403 = key lacks access. Both mean
      // the user's key won't work, so the caller can stop and surface it.
      err.authFailed = res.status === 401 || res.status === 403;
      throw err;
    }
    const json = await res.json();

    const movie = (json.movie_results || [])[0];
    const tv = (json.tv_results || [])[0];
    let match = null;
    let mediaType = null;
    if (preferredType === 'tv' && tv) { match = tv; mediaType = 'tv'; }
    else if (preferredType === 'movie' && movie) { match = movie; mediaType = 'movie'; }
    else if (movie) { match = movie; mediaType = 'movie'; }
    else if (tv) { match = tv; mediaType = 'tv'; }

    let data;
    if (!match) {
      data = { imdbId, hasImages: false, posterUrl: null, backdropUrl: null, backdropPath: null, overview: '', mediaType: preferredType || null };
    } else {
      const posterUrl = imageUrl(match.poster_path, 'w780');
      const backdropUrl = imageUrl(match.backdrop_path, 'original');
      data = {
        imdbId,
        tmdbId: match.id,
        mediaType,
        title: match.title || match.name || '',
        posterUrl,
        backdropUrl,
        backdropPath: match.backdrop_path || null,
        overview: match.overview || '',
        hasImages: !!(posterUrl || backdropUrl)
      };
    }

    await putCached(imdbId, data);
    return data;
  }

  // Fetch every backdrop TMDB has for one title (movie or tv), best-rated
  // first. Used by the immersive player's per-title "clips" slideshow, kept
  // separate from `resolve()` since most titles are only ever shown with
  // their single main backdrop and never need this larger array fetched.
  async function fetchBackdrops(tmdbId, mediaType, key, signal) {
    const cacheKey = `${mediaType}:${tmdbId}`;
    const cached = await imagesCache.get(cacheKey);
    if (cached) return cached;

    const auth = authFor(key);
    const url = `${API_BASE}/${mediaType}/${encodeURIComponent(tmdbId)}/images?${auth.query.slice(1)}`;
    const res = await fetch(url, { headers: auth.headers, signal });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 1;
      const err = new Error('rate-limited');
      err.retryAfter = retryAfter;
      err.rateLimited = true;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`TMDB ${res.status}`);
      err.status = res.status;
      err.authFailed = res.status === 401 || res.status === 403;
      throw err;
    }
    const json = await res.json();

    const images = (json.backdrops || [])
      .slice()
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .map((b) => ({ path: b.file_path, url: imageUrl(b.file_path, 'w1280'), width: b.width, height: b.height }))
      .filter((b) => !!b.url);

    await imagesCache.put(cacheKey, images);
    return images;
  }

  globalThis.ImmersiveTmdb = { resolve, validateKey, imageUrl, fetchBackdrops };
})();
