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

  let _cache = null;
  let _cacheLoad = null;
  let _writeTimer = null;

  function loadCache() {
    if (_cache) return Promise.resolve(_cache);
    if (_cacheLoad) return _cacheLoad;
    _cacheLoad = new Promise((resolve) => {
      chrome.storage.local.get(CACHE_KEY, (data) => {
        _cache = (data && data[CACHE_KEY] && typeof data[CACHE_KEY] === 'object') ? data[CACHE_KEY] : {};
        resolve(_cache);
      });
    });
    return _cacheLoad;
  }

  function scheduleWrite() {
    if (_writeTimer) return;
    _writeTimer = setTimeout(() => {
      _writeTimer = null;
      if (!_cache) return;
      // Evict oldest entries if the cache grows unbounded.
      const keys = Object.keys(_cache);
      if (keys.length > CACHE_MAX) {
        keys
          .sort((a, b) => (_cache[a].at || 0) - (_cache[b].at || 0))
          .slice(0, keys.length - CACHE_MAX)
          .forEach((k) => delete _cache[k]);
      }
      chrome.storage.local.set({ [CACHE_KEY]: _cache });
    }, 800);
  }

  async function getCached(imdbId) {
    const cache = await loadCache();
    const hit = cache[imdbId];
    if (!hit) return null;
    if (Date.now() - (hit.at || 0) > CACHE_TTL_MS) return null;
    return hit.data;
  }

  async function putCached(imdbId, data) {
    const cache = await loadCache();
    cache[imdbId] = { at: Date.now(), data };
    scheduleWrite();
  }

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
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
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
      data = { imdbId, hasImages: false, posterUrl: null, backdropUrl: null, overview: '', mediaType: preferredType || null };
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
        overview: match.overview || '',
        hasImages: !!(posterUrl || backdropUrl)
      };
    }

    await putCached(imdbId, data);
    return data;
  }

  globalThis.ImmersiveTmdb = { resolve, validateKey, imageUrl };
})();
