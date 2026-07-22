// src/immersive/immersive.js
//
// Immersive player controller. Flow:
//   unlock (passphrase) -> config (dynamic filters) -> player (streaming fetch)
//
// Data source: the extension's saved lists in chrome.storage.local. Images come
// from TMDB via ../lib/tmdb.js. The user's key is decrypted once per browser
// session and held in memory (+ chrome.storage.session), never re-persisted.

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const SCOPE = ['all', 'list', 'credits-filter'].includes(params.get('scope')) ? params.get('scope') : 'list';
  const LIST_ID = params.get('id') || '';
  const MODE = params.get('mode') === 'watched' ? 'watched' : 'watching';
  const STORAGE_KEY = `imdb_lists_${MODE}`;

  const CONCURRENCY = 6;

  const state = {
    apiKey: null,
    listName: '',
    source: [],        // normalized movie records for the target scope
    ordered: [],       // config-filtered + sorted items (playback set)
    byId: new Map(),   // imdb_id -> resolved TMDB data
    statusById: new Map(), // imdb_id -> 'pending' | 'complete' | 'incomplete'
    currentId: null,
    displayOrder: [],  // imdb_ids in complete-first order
    slideshow: false,
    slideTimer: null,
    shuffleBag: [],
    abort: null,
    started: false,
    runtimeBuckets: [],
    slideMs: 25000,
    authFailures: 0,   // count of TMDB 401/403 responses this run
    resolvedOk: 0,     // count of successful TMDB responses (image or not)
    authNotified: false,
    shownKeywordsLimit: 30,
    config: { sort: 'position', sortDir: 'desc', types: new Set(), genres: new Set(), keywords: new Set(), runtime: null },
    // Per-title backdrop "clips" slideshow (G).
    clipsCache: new Map(), // imdbId -> { status:'loading'|'ready'|'ineligible'|'error', images:[{path,url}] }
    clips: { active: false, images: [], index: 0, timer: null, forId: null }
  };

  // ---- Field parsers (extension stores strings) --------------------------

  function parseDurationMin(duration) {
    if (!duration) return null;
    const s = String(duration);
    const h = s.match(/(\d+)\s*h/i);
    const m = s.match(/(\d+)\s*m/i);
    let mins = 0;
    if (h) mins += parseInt(h[1], 10) * 60;
    if (m) mins += parseInt(m[1], 10);
    if (!h && !m) {
      const n = parseInt(s, 10);
      if (Number.isFinite(n)) mins = n;
    }
    return mins > 0 ? mins : null;
  }

  // Parse a numeric field. Handles plain numbers ("8.5", 92792), grouped
  // thousands ("1,234"), and abbreviated magnitudes ("470K", "1.2M", "3B") so
  // sorting by votes/rating is correct even if a value arrives abbreviated.
  function parseNumber(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    const m = s.match(/^([\d,.]+)\s*([kmb])\b/i);
    if (m) {
      const base = Number(m[1].replace(/,/g, ''));
      if (!Number.isFinite(base)) return null;
      const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1;
      return base * mult;
    }
    const n = Number(s.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function parseYear(v) {
    const m = String(v || '').match(/\d{4}/);
    return m ? Number(m[0]) : null;
  }

  function splitGenres(v) {
    return String(v || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  }

  // TMDB lookup hint only (breaks find() ties). NOT used for filtering.
  function mediaTypeOf(type) {
    return /tv|series|mini|episode/i.test(String(type || '')) ? 'tv' : 'movie';
  }

  // Fully dynamic faceting: the display label is the value exactly as IMDB gave
  // it (whitespace-normalised); the grouping key folds case + whitespace so
  // "TV Series" and "tv series" merge into one facet without any hardcoded type
  // names. Nothing is remapped, so a title's type is shown verbatim.
  function cleanLabel(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }
  function facetKey(v) {
    return cleanLabel(v).toLowerCase();
  }

  // Build a facet map from raw values: key -> { label, count }. `label` is the
  // most common original casing seen for that key. Empty values fold into an
  // "unknown" bucket labelled from `emptyLabel` so nothing is silently dropped.
  function buildFacet(values, emptyLabel) {
    const map = new Map();
    for (const raw of values) {
      const label = cleanLabel(raw);
      const key = label.toLowerCase(); // empty folds to '', matching facetKey('')
      const shown = label || emptyLabel;
      const e = map.get(key);
      if (e) {
        e.count++;
        // Prefer the casing that occurs most often as the display label.
        e.variants.set(shown, (e.variants.get(shown) || 0) + 1);
        if (e.variants.get(shown) > e.variants.get(e.label)) e.label = shown;
      } else {
        map.set(key, { label: shown, count: 1, variants: new Map([[shown, 1]]) });
      }
    }
    return map;
  }

  // Ordered facet entries: most common first, then alphabetical. Every distinct
  // value present is included — nothing is capped or hidden here.
  function facetEntries(map) {
    return Array.from(map.entries())
      .map(([key, v]) => ({ value: key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  // Drop any selected keys that are no longer offered (keeps state consistent
  // if the underlying data changes).
  function pruneSelection(set, entries) {
    const valid = new Set(entries.map((e) => e.value));
    for (const k of Array.from(set)) if (!valid.has(k)) set.delete(k);
  }

  // Runtime buckets are computed dynamically from the target list's actual
  // spread (quartiles snapped to 5-min marks), so a short-runtime TV list
  // (e.g. 25–60 min episodes) gets meaningful ranges instead of collapsing into
  // one fixed movie-length bucket. Returns [] when there isn't enough spread.
  function buildRuntimeBuckets(source) {
    const vals = source.map((m) => parseDurationMin(m.duration)).filter((v) => v != null).sort((a, b) => a - b);
    if (vals.length < 4) return [];
    const min = vals[0];
    const max = vals[vals.length - 1];
    if (max - min < 10) return [];

    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
    let cuts = [q(0.25), q(0.5), q(0.75)].map((v) => Math.round(v / 5) * 5);
    cuts = [...new Set(cuts)].filter((c) => c > min && c < max).sort((a, b) => a - b);
    if (cuts.length === 0) {
      const mid = Math.round((min + max) / 2 / 5) * 5;
      if (mid > min && mid < max) cuts = [mid]; else return [];
    }

    const bounds = [null, ...cuts, null];
    const buckets = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i];
      const hi = bounds[i + 1];
      const label = lo == null ? `Under ${hi} min` : hi == null ? `Over ${lo} min` : `${lo}–${hi} min`;
      const test = (m) => m != null && (lo == null || m >= lo) && (hi == null || m < hi);
      buckets.push({ key: 'rt' + i, label, test });
    }
    return buckets;
  }

  // ---- Stage switching ---------------------------------------------------

  function showStage(id) {
    document.querySelectorAll('.stage').forEach((el) => el.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function showMessage(title, sub, actionLabel, actionFn) {
    $('#message-title').textContent = title;
    $('#message-sub').textContent = sub || '';
    const btn = $('#message-action');
    if (actionLabel) {
      btn.textContent = actionLabel;
      btn.classList.remove('hidden');
      btn.onclick = actionFn || (() => window.close());
    } else {
      btn.classList.add('hidden');
    }
    showStage('#stage-message');
  }

  // ---- Boot --------------------------------------------------------------

  async function boot() {
    let movies;
    try {
      movies = await loadMovies();
    } catch (err) {
      showMessage('Could not load your lists', err.message || 'Storage error.');
      return;
    }
    if (!movies || movies.length === 0) {
      showMessage('Nothing to project', 'This list has no titles yet. Add or refresh it in the extension.');
      return;
    }
    state.source = movies;

    // If launched from the AI Clustering page, strictly filter the base dataset
    // to match the selected IDs without polluting the keyword filter panel.
    if (params.get('aiMovies') === '1') {
      try {
        const aiMovies = await new Promise((resolve) => {
          try {
            chrome.storage.session.get('ai_cluster_movies', (data) => {
              resolve((data && Array.isArray(data.ai_cluster_movies)) ? data.ai_cluster_movies : null);
            });
          } catch { resolve(null); }
        });
        const targetIds = aiMovies || await new Promise((resolve) => {
          chrome.storage.local.get('ai_cluster_movies', (data) => {
            resolve((data && Array.isArray(data.ai_cluster_movies)) ? data.ai_cluster_movies : []);
          });
        });
        
        if (targetIds.length > 0) {
          const targetSet = new Set(targetIds);
          state.source = state.source.filter(m => {
            const id = String(m.imdb_id || '').trim();
            const key = id || `t:${m.title}|${m.year}`;
            return targetSet.has(key);
          });
        }
        
        // Clean up the temporary keys
        try { chrome.storage.session.remove('ai_cluster_movies'); } catch { /* noop */ }
        try { chrome.storage.local.remove('ai_cluster_movies'); } catch { /* noop */ }
      } catch { /* non-critical — proceed with unfiltered dataset */ }
    } else if (SCOPE === 'credits-filter') {
      try {
        const filterData = await new Promise((resolve) => {
          chrome.storage.session.get('imdb_credits_immersive_filter', (data) => {
            resolve(data && data.imdb_credits_immersive_filter);
          });
        });
        if (filterData && Array.isArray(filterData.imdbIds)) {
          const targetSet = new Set(filterData.imdbIds);
          state.source = state.source.filter(m => targetSet.has(m.imdb_id));
        }
      } catch { /* proceed */ }
    }

    // Resolve the API key: session cache first, else decrypt via passphrase.
    const sessionKey = await getSessionKey();
    if (sessionKey) {
      state.apiKey = sessionKey;
      if (params.get('aiMovies') === '1' || SCOPE === 'credits-filter') startPlayback(false); else openConfig();
    } else {
      const rec = await getEncryptedRecord();
      if (!rec) {
        showMessage('No TMDB key found', 'Add your TMDB API key in the extension settings, then reopen Immersive.');
        return;
      }
      promptUnlock(rec);
    }
  }

  function loadMovies() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
        const lists = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
        if (SCOPE === 'list') {
          const list = lists.find((l) => l && l.id === LIST_ID);
          if (!list) { resolve([]); return; }
          state.listName = list.name || 'IMDB List';
          resolve(dedupe(list.movies || []));
        } else {
          state.listName = SCOPE === 'credits-filter' ? (params.get('personName') || 'Credits') : 'All lists';
          const all = [];
          for (const l of lists) if (l && Array.isArray(l.movies)) all.push(...l.movies);
          resolve(dedupe(all));
        }
      });
    });
  }

  function dedupe(movies) {
    const seen = new Set();
    const out = [];
    for (const m of movies) {
      if (!m || typeof m !== 'object') continue;
      const id = String(m.imdb_id || '').trim();
      const key = id || `t:${m.title}|${m.year}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out;
  }

  function getSessionKey() {
    return new Promise((resolve) => {
      try {
        chrome.storage.session.get('imdb_tmdb_key_plain', (data) => {
          resolve((data && data.imdb_tmdb_key_plain) || null);
        });
      } catch { resolve(null); }
    });
  }

  function getEncryptedRecord() {
    return new Promise((resolve) => {
      chrome.storage.local.get('imdb_tmdb_key', (data) => {
        resolve((data && data.imdb_tmdb_key) || null);
      });
    });
  }

  // ---- Unlock ------------------------------------------------------------

  function promptUnlock(record) {
    showStage('#stage-unlock');
    const form = $('#unlock-form');
    const pass = $('#unlock-pass');
    const errEl = $('#unlock-error');
    pass.focus();

    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const value = pass.value;
      if (!value) return;
      const btn = form.querySelector('button');
      btn.disabled = true;
      try {
        const key = await globalThis.ImmersiveCrypto.decrypt(record, value);
        state.apiKey = key;
        try { await chrome.storage.session.set({ imdb_tmdb_key_plain: key }); } catch { /* noop */ }
        if (params.get('aiMovies') === '1' || SCOPE === 'credits-filter') startPlayback(false); else openConfig();
      } catch (err) {
        errEl.textContent = err.message === 'Wrong passphrase'
          ? 'Wrong passphrase. Try again.'
          : (err.message || 'Could not unlock.');
        errEl.classList.remove('hidden');
        pass.select();
      } finally {
        btn.disabled = false;
      }
    };
  }

  // ---- Config ------------------------------------------------------------

  const SORTS = [
    { key: 'position', label: 'List order' },
    { key: 'title', label: 'Alphabetical' },
    { key: 'rating', label: 'IMDb rating' },
    { key: 'votes', label: 'Number of ratings' },
    { key: 'year', label: 'Release date' },
    { key: 'duration', label: 'Runtime' }
  ];

  function openConfig() {
    state.shownKeywordsLimit = 30;
    $('#config-eyebrow').textContent = SCOPE === 'all' ? 'Immersive · All lists' : 'Immersive';
    $('#config-title').textContent = state.listName;
    $('#config-count').textContent = `${state.source.length} title${state.source.length === 1 ? '' : 's'}`;
    buildFilterUI('cfg', () => updateMatchCount());
    $('#btn-exit-config').onclick = () => window.close();
    $('#btn-start').onclick = startPlayback;
    updateMatchCount();
    showStage('#stage-config');
  }

  // Renders the sort/order/type/genre/runtime pill groups into a set of
  // elements identified by `prefix` (`cfg` for the config screen, `pf` for the
  // in-player overlay). `onChange` runs after any selection change so the caller
  // can update its own count / live playback.
  function buildFilterUI(prefix, onChange) {
    const el = (name) => $(`#${prefix}-${name}`);

    // Sort
    renderPills(el('sort'), SORTS.map((s) => ({ value: s.key, label: s.label })), {
      selected: () => new Set([state.config.sort]),
      onToggle: (v) => { state.config.sort = v; state.config.sortDir = defaultDirFor(v); syncPills(); updateDirLabels(prefix); onChange(); },
      single: true
    });

    // Sort direction
    renderPills(el('sort-dir'), [
      { value: 'desc', label: dirLabel('desc') },
      { value: 'asc', label: dirLabel('asc') }
    ], {
      selected: () => new Set([state.config.sortDir]),
      onToggle: (v) => { state.config.sortDir = v; syncPills(); onChange(); },
      single: true
    });
    updateDirLabels(prefix);

    // Type — every distinct type present, verbatim, with accurate counts.
    const typeEntries = facetEntries(buildFacet(state.source.map((m) => m.type), 'Unknown type'));
    pruneSelection(state.config.types, typeEntries);
    if (typeEntries.length === 0) {
      el('type-group').classList.add('hidden');
    } else {
      el('type-group').classList.remove('hidden');
      renderPills(el('type'), typeEntries, {
        selected: () => state.config.types,
        onToggle: (v) => { toggleSet(state.config.types, v); syncPills(); onChange(); }
      });
    }

    // Genre — every distinct genre present (a title contributes each of its
    // genres), with accurate counts.
    const genreEntries = facetEntries(buildFacet(state.source.flatMap((m) => splitGenres(m.genre)), 'Unknown genre'));
    pruneSelection(state.config.genres, genreEntries);
    if (genreEntries.length === 0) {
      el('genre-group').classList.add('hidden');
    } else {
      el('genre-group').classList.remove('hidden');
      renderPills(el('genre'), genreEntries, {
        selected: () => state.config.genres,
        onToggle: (v) => { toggleSet(state.config.genres, v); syncPills(); onChange(); }
      });
    }

    // Keywords — every distinct keyword present, sorted by count descending.
    const keywordsGroup = el('keywords-group');
    const keywordsContainer = el('keywords');
    if (keywordsGroup && keywordsContainer) {
      const allKeywords = state.source.flatMap((m) => m.keywords || []);
      const keywordEntries = facetEntries(buildFacet(allKeywords, 'Unknown keyword'))
        .filter(e => e.count >= 2);
      pruneSelection(state.config.keywords, keywordEntries);

      if (keywordEntries.length === 0) {
        keywordsGroup.classList.add('hidden');
      } else {
        keywordsGroup.classList.remove('hidden');
        const visibleKeywords = keywordEntries.slice(0, state.shownKeywordsLimit);

        renderPills(keywordsContainer, visibleKeywords, {
          selected: () => state.config.keywords,
          onToggle: (v) => { toggleSet(state.config.keywords, v); syncPills(); onChange(); }
        });

        if (keywordEntries.length > state.shownKeywordsLimit) {
          const moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'pill show-more-pill';
          moreBtn.textContent = `+ Show more (${keywordEntries.length - state.shownKeywordsLimit} left)`;
          moreBtn.onclick = (e) => {
            e.preventDefault();
            state.shownKeywordsLimit += 30;
            buildFilterUI(prefix, onChange);
          };
          keywordsContainer.appendChild(moreBtn);
        }
      }
    }

    // Runtime — dynamic buckets from this list's spread.
    state.runtimeBuckets = buildRuntimeBuckets(state.source);
    const rtCounts = new Map();
    for (const m of state.source) {
      const mins = parseDurationMin(m.duration);
      for (const b of state.runtimeBuckets) if (b.test(mins)) rtCounts.set(b.key, (rtCounts.get(b.key) || 0) + 1);
    }
    const activeBuckets = state.runtimeBuckets.filter((b) => rtCounts.get(b.key));
    if (state.config.runtime && !activeBuckets.some((b) => b.key === state.config.runtime)) state.config.runtime = null;
    if (activeBuckets.length <= 1) {
      el('runtime-group').classList.add('hidden');
    } else {
      el('runtime-group').classList.remove('hidden');
      renderPills(el('runtime'), activeBuckets.map((b) => ({ value: b.key, label: b.label, count: rtCounts.get(b.key) })), {
        selected: () => new Set(state.config.runtime ? [state.config.runtime] : []),
        onToggle: (v) => { state.config.runtime = state.config.runtime === v ? null : v; syncPills(); onChange(); },
        single: true,
        clearable: true
      });
    }
  }

  // Natural default direction per field: A→Z for title, otherwise "largest
  // first" (newest year, highest rating/votes, longest runtime).
  function defaultDirFor(sort) {
    return sort === 'title' ? 'asc' : 'desc';
  }

  // Direction labels depend on the active sort field.
  function dirLabel(dir) {
    const s = state.config.sort;
    if (s === 'title') return dir === 'asc' ? 'A → Z' : 'Z → A';
    if (s === 'year') return dir === 'asc' ? 'Oldest first' : 'Newest first';
    return dir === 'asc' ? 'Smallest first' : 'Largest first';
  }

  function updateDirLabels(prefix) {
    const row = $(`#${prefix}-sort-dir`);
    const group = $(`#${prefix}-sort-dir-group`);
    if (!row || !group) return;
    // "List order" is the list's own order — direction doesn't apply.
    if (state.config.sort === 'position') { group.classList.add('hidden'); return; }
    group.classList.remove('hidden');
    row.querySelectorAll('.pill').forEach((p) => {
      const label = dirLabel(p.dataset.value);
      if (p.childNodes[0]) p.childNodes[0].nodeValue = label; else p.textContent = label;
    });
  }

  function renderPills(container, items, opts) {
    container.innerHTML = '';
    container._opts = opts;
    for (const it of items) {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.type = 'button';
      btn.dataset.value = it.value;
      btn.innerHTML = it.count != null
        ? `${escapeHtml(it.label)}<span class="pill-count">${it.count}</span>`
        : escapeHtml(it.label);
      btn.setAttribute('aria-pressed', String(opts.selected().has(it.value)));
      btn.onclick = () => opts.onToggle(it.value);
      container.appendChild(btn);
    }
  }

  function syncPills() {
    document.querySelectorAll('.pill-row').forEach((row) => {
      const opts = row._opts;
      if (!opts) return;
      const sel = opts.selected();
      row.querySelectorAll('.pill').forEach((p) => p.setAttribute('aria-pressed', String(sel.has(p.dataset.value))));
    });
  }

  function toggleSet(set, v) { if (set.has(v)) set.delete(v); else set.add(v); }

  function computeFiltered() {
    const c = state.config;
    let out = state.source.filter((m) => {
      // Type / genre matching uses the same facet keys the pills were built
      // from, so what you select is exactly what you get.
      if (c.types.size && !c.types.has(facetKey(m.type))) return false;
      if (c.genres.size) {
        const gs = splitGenres(m.genre).map(facetKey);
        if (!gs.some((g) => c.genres.has(g))) return false;
      }
      if (c.keywords && c.keywords.size) {
        const ks = (m.keywords || []).map(facetKey);
        if (!ks.some((k) => c.keywords.has(k))) return false;
      }
      if (c.runtime) {
        const b = state.runtimeBuckets.find((x) => x.key === c.runtime);
        if (b && !b.test(parseDurationMin(m.duration))) return false;
      }
      return true;
    });

    // Base comparator is ascending; sortDir flips it. "List order" ignores dir.
    const s = c.sort;
    const asc =
      s === 'title' ? (a, b) => String(a.title).localeCompare(String(b.title)) :
      s === 'rating' ? (a, b) => (parseNumber(a.rating) ?? -1) - (parseNumber(b.rating) ?? -1) :
      s === 'votes' ? (a, b) => (parseNumber(a.votes) ?? -1) - (parseNumber(b.votes) ?? -1) :
      s === 'year' ? (a, b) => (parseYear(a.year) ?? -1) - (parseYear(b.year) ?? -1) :
      s === 'duration' ? (a, b) => (parseDurationMin(a.duration) ?? -1) - (parseDurationMin(b.duration) ?? -1) :
      null;

    if (!asc) {
      // List order.
      return [...out].sort((a, b) => (parseNumber(a.position) ?? 1e9) - (parseNumber(b.position) ?? 1e9));
    }
    const cmp = c.sortDir === 'asc' ? asc : (a, b) => asc(b, a);
    return [...out].sort(cmp);
  }

  function updateMatchCount() {
    const n = computeFiltered().length;
    $('#config-match').textContent = `${n} match${n === 1 ? '' : 'es'}`;
    $('#btn-start').disabled = n === 0;
  }

  // ---- Playback ----------------------------------------------------------

  function startPlayback(autoFullscreen = true) {
    state.ordered = computeFiltered();
    if (state.ordered.length === 0) return;

    state.byId.clear();
    state.statusById.clear();
    for (const m of state.ordered) state.statusById.set(idOf(m), 'pending');
    state.currentId = null;
    state.displayOrder = [];
    state.started = false;
    state.authFailures = 0;
    state.resolvedOk = 0;
    state.authNotified = false;

    showStage('#stage-player');
    $('#loading-first').classList.remove('hidden');
    $('#info-panel').classList.add('hidden');

    bindPlayerControls();
    if (autoFullscreen) {
      requestFullscreen();
    }
    startFetchEngine();
  }

  function idOf(m) {
    return String(m.imdb_id || '').trim() || `t:${m.title}|${m.year}`;
  }

  // Streaming fetch pool: resolves items in config order, updates the player as
  // soon as the first complete item arrives, and keeps the display order
  // complete-first.
  function startFetchEngine() {
    if (state.abort) state.abort.abort();
    state.abort = new AbortController();
    const signal = state.abort.signal;

    // Only fetch items still pending (a live re-filter keeps resolved items).
    const queue = state.ordered.filter((m) => state.statusById.get(idOf(m)) === 'pending');
    let active = 0;
    let done = state.ordered.length - queue.length;
    const total = state.ordered.length;

    if (queue.length === 0) { $('#fetch-indicator').classList.add('hidden'); return; }
    updateFetchIndicator(done, total);

    const pump = () => {
      if (signal.aborted) return;
      while (active < CONCURRENCY && queue.length) {
        const movie = queue.shift();
        active++;
        resolveOne(movie, signal)
          .catch(() => { if (!signal.aborted) markIncomplete(movie); })
          .finally(() => {
            active--;
            done++;
            if (!signal.aborted) {
              updateFetchIndicator(done, total);
              if (done >= total) $('#fetch-indicator').classList.add('hidden');
            }
            pump();
          });
      }
    };
    pump();
  }

  // One TMDB resolve with a single rate-limit retry. Errors propagate to the
  // caller so it can distinguish auth failures from transient ones.
  async function resolveWithRetry(imdbId, movie, signal) {
    try {
      return await globalThis.ImmersiveTmdb.resolve(imdbId, state.apiKey, mediaTypeOf(movie.type), signal);
    } catch (err) {
      if (err && err.rateLimited && !signal.aborted) {
        await sleep((err.retryAfter || 1) * 1000);
        if (signal.aborted) throw err;
        return await globalThis.ImmersiveTmdb.resolve(imdbId, state.apiKey, mediaTypeOf(movie.type), signal);
      }
      throw err;
    }
  }

  async function resolveOne(movie, signal) {
    const id = idOf(movie);
    const imdbId = String(movie.imdb_id || '').trim();
    if (!/^tt\d+$/.test(imdbId)) { markIncomplete(movie); return; }

    let data;
    try {
      data = await resolveWithRetry(imdbId, movie, signal);
    } catch (err) {
      // A superseded (aborted) request must NOT alter status — the new fetch
      // engine owns these items now.
      if (signal.aborted) return;
      if (err && err.authFailed) { state.authFailures++; maybeShowAuthError(); }
      markIncomplete(movie);
      return;
    }
    if (signal.aborted) return;

    state.resolvedOk++;            // TMDB answered (even if it had no images)
    state.byId.set(id, data);
    if (data && data.backdropUrl) markComplete(movie);
    else markIncomplete(movie);
  }

  // If the very first several resolves all fail with 401/403 and nothing has
  // succeeded, the key is bad/revoked — stop and say so instead of silently
  // showing an all-placeholder slideshow.
  function maybeShowAuthError() {
    if (state.authNotified || state.started || state.resolvedOk > 0) return;
    const threshold = Math.min(6, state.ordered.length);
    if (state.authFailures < threshold) return;
    state.authNotified = true;
    if (state.abort) state.abort.abort();
    showMessage(
      'TMDB rejected your key',
      'Your saved TMDB key was refused (401/403). It may be invalid, revoked, or missing access. Update it in the extension settings, then reopen Immersive.',
      'Back to filters',
      backToConfig
    );
  }

  // Coalesce display-order rebuilds to at most one per animation frame. Each
  // rebuild is O(n); marking happens O(n) times during a load, so calling it
  // per-item is O(n^2) and janks large lists. Batching keeps it smooth while
  // still starting the player within a frame of the first complete item.
  let _displayRaf = 0;
  function scheduleDisplayUpdate() {
    if (_displayRaf) return;
    _displayRaf = requestAnimationFrame(() => {
      _displayRaf = 0;
      rebuildDisplayOrder();
      maybeStartFirst();
    });
  }

  function markComplete(movie) {
    const id = idOf(movie);
    if (state.statusById.get(id) === 'complete') return;
    state.statusById.set(id, 'complete');
    scheduleDisplayUpdate();
  }

  function markIncomplete(movie) {
    const id = idOf(movie);
    if (state.statusById.get(id) === 'complete') return;
    state.statusById.set(id, 'incomplete');
    scheduleDisplayUpdate();
  }

  // Complete items first (config order), then incomplete items (config order).
  function rebuildDisplayOrder() {
    const complete = [];
    const incomplete = [];
    for (const m of state.ordered) {
      const id = idOf(m);
      const st = state.statusById.get(id);
      if (st === 'complete') complete.push(id);
      else if (st === 'incomplete') incomplete.push(id);
    }
    state.displayOrder = complete.concat(incomplete);
    if (state.started) updateCounter();
  }

  // Start the player as soon as we have the first *complete* item; if every
  // item finished with none complete, fall back to showing placeholders.
  function maybeStartFirst() {
    if (state.started) return;
    const firstComplete = state.displayOrder.find((id) => state.statusById.get(id) === 'complete');
    const allDone = state.ordered.every((m) => state.statusById.get(idOf(m)) !== 'pending');

    let startId = firstComplete;
    if (!startId && allDone && state.displayOrder.length) startId = state.displayOrder[0];
    if (!startId) return;

    state.started = true;
    $('#loading-first').classList.add('hidden');
    goTo(startId);
  }

  // ---- Rendering ---------------------------------------------------------

  function movieById(id) {
    return state.ordered.find((m) => idOf(m) === id);
  }

  function goTo(id) {
    if (!id) return;
    state.currentId = id;
    const movie = movieById(id);
    const data = state.byId.get(id) || {};
    renderBackdrop(id, movie, data);
    renderInfo(movie, data);
    updateCounter();
    preloadNeighbors();
    prefetchClipsMeta(id);
  }

  function makeBackdropPlaceholder(movie) {
    const node = document.createElement('div');
    node.className = 'backdrop-placeholder';
    const span = document.createElement('span');
    span.textContent = (movie && movie.title) || '';
    node.appendChild(span);
    return node;
  }

  function renderBackdrop(id, movie, data) {
    const layer = $('#backdrop-layer');
    // Fade out old layers.
    const olds = Array.from(layer.children);

    let node;
    if (data.backdropUrl) {
      node = document.createElement('img');
      node.className = 'backdrop-img';
      node.alt = '';
      node.decoding = 'async';
      const activate = () => requestAnimationFrame(() => node.classList.add('is-active'));
      // If the image fails to load (network blip / stale CDN url), never leave a
      // black frame: swap in the title placeholder in the same slot.
      node.onerror = () => {
        const ph = makeBackdropPlaceholder(movie);
        if (node.parentNode) node.replaceWith(ph); else node = ph;
        requestAnimationFrame(() => ph.classList.add('is-active'));
      };
      node.onload = activate;
      node.src = data.backdropUrl;
      if (node.complete) {
        if (node.naturalWidth > 0) activate();
        else { node = makeBackdropPlaceholder(movie); requestAnimationFrame(() => node.classList.add('is-active')); }
      }
    } else {
      node = makeBackdropPlaceholder(movie);
      requestAnimationFrame(() => node.classList.add('is-active'));
    }
    layer.appendChild(node);

    // Remove previous layers after the crossfade.
    setTimeout(() => olds.forEach((o) => o.remove()), 950);
  }

  function renderInfo(movie, data) {
    const panel = $('#info-panel');
    panel.classList.remove('hidden');
    // restart enter animation
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');

    // Poster. Built via the DOM (not innerHTML) so the URL is never parsed as
    // markup, with an onerror that hides the frame if the image won't load.
    const posterEl = $('#info-poster');
    posterEl.innerHTML = '';
    if (data.posterUrl) {
      posterEl.style.display = '';
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.onerror = () => { posterEl.style.display = 'none'; posterEl.innerHTML = ''; };
      img.src = data.posterUrl;
      posterEl.appendChild(img);
    } else {
      posterEl.style.display = 'none';
    }

    // Show the real IMDB type verbatim (e.g. "TV Mini Series"), not a guess.
    const typeLabel = cleanLabel(movie.type);
    const year = parseYear(movie.year);
    const rating = parseNumber(movie.rating);
    const metaParts = [year, typeLabel, movie.duration].filter(Boolean);
    if (rating != null) metaParts.push(`IMDb ${rating.toFixed(1)}`);
    $('#info-meta').textContent = metaParts.join('  ·  ');

    $('#info-title').textContent = movie.title || '';

    const overview = (data.overview || movie.description || '').trim();
    const ov = $('#info-overview');
    ov.textContent = overview;
    ov.style.display = overview ? '' : 'none';

    const genres = splitGenres(movie.genre).slice(0, 4);
    $('#info-genres').innerHTML = genres.map((g) => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('');
  }

  function updateCounter() {
    const pos = state.displayOrder.indexOf(state.currentId);
    const total = state.displayOrder.length;
    if (pos < 0) { $('#counter').textContent = ''; return; }
    $('#counter').textContent = `${String(pos + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  }

  function updateFetchIndicator(done, total) {
    const el = $('#fetch-indicator');
    if (done >= total) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = `Loading ${done} / ${total}`;
  }

  // Robust preloading: fully load (and decode) the backdrop AND poster for the
  // items the user is most likely to see next, so navigation is instant.
  // Loaded Image objects are retained in _preloadCache so the browser keeps the
  // decoded bitmap alive; the cache is bounded and evicts least-recently-wanted.
  const _preloadCache = new Map(); // url -> HTMLImageElement
  const PRELOAD_AHEAD = 4;   // items ahead in linear order
  const PRELOAD_BEHIND = 2;  // items behind (for back-nav)
  const PRELOAD_MAX = 40;

  function preloadUrl(url) {
    if (!url || _preloadCache.has(url)) {
      if (url) { // refresh recency
        const img = _preloadCache.get(url);
        _preloadCache.delete(url);
        _preloadCache.set(url, img);
      }
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    if (img.decode) img.decode().catch(() => {});
    _preloadCache.set(url, img);
    // Evict oldest entries beyond the cap.
    while (_preloadCache.size > PRELOAD_MAX) {
      const oldest = _preloadCache.keys().next().value;
      _preloadCache.delete(oldest);
    }
  }

  function preloadId(id) {
    const d = state.byId.get(id);
    if (!d) return;
    // Backdrop first (it's the large hero image), then poster.
    if (d.backdropUrl) preloadUrl(d.backdropUrl);
    if (d.posterUrl) preloadUrl(d.posterUrl);
  }

  function preloadNeighbors() {
    const order = state.displayOrder;
    if (!order.length) return;
    const pos = order.indexOf(state.currentId);
    if (pos < 0) return;

    // Linear neighbours (manual nav uses these).
    for (let i = 1; i <= PRELOAD_AHEAD; i++) preloadId(order[(pos + i) % order.length]);
    for (let i = 1; i <= PRELOAD_BEHIND; i++) preloadId(order[(pos - i + order.length) % order.length]);

    // Slideshow jumps around — warm the next few shuffle-bag items too.
    if (state.slideshow) {
      const bag = state.shuffleBag;
      for (let i = 0; i < Math.min(3, bag.length); i++) preloadId(bag[bag.length - 1 - i]);
    }
  }

  // ---- Navigation --------------------------------------------------------

  function step(delta) {
    const order = state.displayOrder;
    if (!order.length) return;
    let pos = order.indexOf(state.currentId);
    if (pos < 0) pos = 0;
    const next = (pos + delta + order.length) % order.length;
    goTo(order[next]);
    if (state.slideshow) restartSlideTimer();
  }

  // ---- Slideshow (shuffled, whole-list coverage, chosen interval) --------

  const SLIDE_INTERVALS = [
    { value: 5000, label: '5s' },
    { value: 10000, label: '10s' },
    { value: 25000, label: '25s' },
    { value: 50000, label: '50s' }
  ];

  // Clicking the slideshow button: if playing, stop; otherwise open the
  // interval picker (10/25/50s). Picking an interval starts playback.
  function onSlideshowButton() {
    if (state.slideshow) { stopSlideshow(); return; }
    toggleSlidePicker();
  }

  function toggleSlidePicker(force) {
    const picker = $('#slide-picker');
    const open = force != null ? force : !picker.classList.contains('is-open');
    if (!open) { picker.classList.remove('is-open'); return; }
    // Build interval pills.
    renderPills($('#slide-intervals'), SLIDE_INTERVALS.map((i) => ({ value: String(i.value), label: i.label })), {
      selected: () => new Set([String(state.slideMs)]),
      onToggle: (v) => { state.slideMs = Number(v); toggleSlidePicker(false); startSlideshow(); },
      single: true
    });
    picker.classList.add('is-open');
  }

  function startSlideshow() {
    state.slideshow = true;
    state.shuffleBag = [];
    $('#btn-slideshow').setAttribute('aria-pressed', 'true');
    $('#slideshow-label').textContent = 'Playing';
    $('#slide-progress').classList.remove('hidden');
    preloadNeighbors();
    restartSlideTimer();
  }

  function stopSlideshow() {
    state.slideshow = false;
    clearTimeout(state.slideTimer);
    $('#btn-slideshow').setAttribute('aria-pressed', 'false');
    $('#slideshow-label').textContent = 'Slideshow';
    $('#slide-progress').classList.add('hidden');
    resetSlideBar(false);
  }

  // Space toggles quickly using the current interval (no picker).
  function quickToggleSlideshow() {
    if (state.slideshow) stopSlideshow(); else startSlideshow();
  }

  function restartSlideTimer() {
    clearTimeout(state.slideTimer);
    resetSlideBar(true);
    state.slideTimer = setTimeout(advanceSlideshow, state.slideMs);
  }

  function advanceSlideshow() {
    if (!state.slideshow) return;
    goTo(nextShuffledId());
    restartSlideTimer();
  }

  // Draw from a shuffle bag so the whole list is covered once before repeats.
  function nextShuffledId() {
    if (!state.shuffleBag.length) {
      state.shuffleBag = shuffle(state.displayOrder.slice());
      // Avoid immediately repeating the current item at a bag boundary.
      if (state.shuffleBag[state.shuffleBag.length - 1] === state.currentId && state.shuffleBag.length > 1) {
        state.shuffleBag.unshift(state.shuffleBag.pop());
      }
    }
    let id = state.shuffleBag.pop();
    if (id === state.currentId && state.shuffleBag.length) id = state.shuffleBag.pop();
    return id;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function resetSlideBar(run) {
    const bar = $('#slide-progress-bar');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    if (run) {
      bar.style.transition = `width ${state.slideMs}ms linear`;
      bar.style.width = '100%';
    }
  }

  // ---- Per-title clips slideshow (G) -------------------------------------
  //
  // A second, fully immersive slideshow of the CURRENT title's own high-res
  // backdrops (not the poster, and never the one image already behind the info
  // panel). Metadata is prefetched for the current title as soon as it's shown,
  // so pressing G is instant in the common case. Loops forever until closed.

  const CLIPS_INTERVAL_MS = 4000;
  const CLIPS_PRELOAD_AHEAD = 3;

  // The main immersive backdrop's TMDB file_path, used to exclude that exact
  // image from the clips slideshow. `backdropPath` is authoritative when
  // present; older cache entries only have `backdropUrl`, so recover the path
  // from it (the trailing "/<hash>.jpg" segment, identical across image sizes).
  function mainBackdropPath(data) {
    if (!data) return null;
    if (data.backdropPath) return data.backdropPath;
    const url = data.backdropUrl;
    if (!url) return null;
    const m = String(url).match(/\/t\/p\/[^/]+(\/[^/?#]+)/);
    return m ? m[1] : null;
  }

  // Kick off (or reuse) a backdrop fetch for `id`. Fire-and-forget; result is
  // cached in state.clipsCache keyed by imdb_id. Never throws to the caller.
  function prefetchClipsMeta(id) {
    if (state.clipsCache.has(id)) return; // loading, ready, ineligible or error
    const data = state.byId.get(id);
    if (!data || !data.tmdbId || !data.mediaType) {
      state.clipsCache.set(id, { status: 'ineligible', images: [] });
      return;
    }
    state.clipsCache.set(id, { status: 'loading', images: [] });
    loadClips(id, data);
  }

  async function loadClips(id, data) {
    // The main backdrop's path. Prefer the explicit field, but fall back to
    // parsing it out of backdropUrl so entries cached before backdropPath
    // existed are still excluded (file_path is size-independent).
    const excludePath = mainBackdropPath(data);
    try {
      let images = await globalThis.ImmersiveTmdb.fetchBackdrops(data.tmdbId, data.mediaType, state.apiKey);
      // Drop the exact image already used as the main immersive backdrop.
      if (excludePath) images = images.filter((im) => im.path !== excludePath);
      const entry = images.length >= 2
        ? { status: 'ready', images }
        : { status: 'ineligible', images: [] };
      state.clipsCache.set(id, entry);
    } catch (err) {
      if (err && err.rateLimited) {
        // One retry after the requested delay, then give up gracefully.
        try {
          await sleep((err.retryAfter || 1) * 1000);
          let images = await globalThis.ImmersiveTmdb.fetchBackdrops(data.tmdbId, data.mediaType, state.apiKey);
          if (excludePath) images = images.filter((im) => im.path !== excludePath);
          state.clipsCache.set(id, images.length >= 2 ? { status: 'ready', images } : { status: 'ineligible', images: [] });
        } catch {
          state.clipsCache.set(id, { status: 'error', images: [] });
        }
      } else {
        state.clipsCache.set(id, { status: 'error', images: [] });
      }
    }
    // If the user is waiting on this exact title's clips, react now.
    if (state.clips.active && state.clips.forId === id && !state.clips.images.length) {
      applyClipsForCurrent();
    }
  }

  function toggleClips() {
    if (state.clips.active) { closeClips(); return; }
    openClips();
  }

  function openClips() {
    const id = state.currentId;
    if (!id) return;
    state.clips.active = true;
    state.clips.forId = id;
    state.clips.images = [];
    state.clips.index = 0;

    // Pause (don't stop) the main title-to-title slideshow so it resumes on
    // close without any button-state flicker.
    clearTimeout(state.slideTimer);
    resetSlideBar(false);

    $('#clips-layer').classList.add('is-open');
    $('#btn-clips').setAttribute('aria-pressed', 'true');
    $('#btn-clips-close').onclick = closeClips;
    $('#clips-title').textContent = '';

    prefetchClipsMeta(id);
    applyClipsForCurrent();
  }

  // Reflect whatever the cache currently holds for the active title: spinner
  // while loading, the slideshow when ready, or the "no clips" state.
  function applyClipsForCurrent() {
    const id = state.clips.forId;
    const entry = state.clipsCache.get(id) || { status: 'loading', images: [] };
    const movie = movieById(id);
    const title = (movie && movie.title) || '';

    if (entry.status === 'loading') {
      showClipsLoading();
      return;
    }
    if (entry.status === 'ready' && entry.images.length >= 2) {
      startClipsPlayback(entry.images);
      return;
    }
    // ineligible or error -> friendly empty state.
    showClipsEmpty(title);
  }

  function showClipsLoading() {
    clearTimeout(state.clips.timer);
    $('#clips-empty').classList.add('hidden');
    $('#clips-progress').classList.add('hidden');
    const layer = $('#clips-backdrop');
    layer.innerHTML = '<div class="clips-spinner"><div class="shimmer"></div></div>';
  }

  function showClipsEmpty(title) {
    clearTimeout(state.clips.timer);
    state.clips.images = [];
    $('#clips-backdrop').innerHTML = '';
    $('#clips-progress').classList.add('hidden');
    $('#clips-title').textContent = '';
    $('#clips-empty-title').textContent = title || 'No clips';
    $('#clips-empty').classList.remove('hidden');
  }

  function startClipsPlayback(images) {
    $('#clips-empty').classList.add('hidden');
    $('#clips-backdrop').innerHTML = '';
    $('#clips-progress').classList.remove('hidden');
    const movie = movieById(state.clips.forId);
    $('#clips-title').textContent = (movie && movie.title) || '';
    state.clips.images = images;
    state.clips.index = 0;
    renderClip(0);
    restartClipsTimer();
  }

  function renderClip(index) {
    const images = state.clips.images;
    if (!images.length) return;
    const im = images[index % images.length];
    const layer = $('#clips-backdrop');
    const olds = Array.from(layer.children);

    const node = document.createElement('img');
    node.className = 'clips-img';
    node.alt = '';
    node.decoding = 'async';
    const activate = () => requestAnimationFrame(() => node.classList.add('is-active'));
    node.onload = activate;
    node.onerror = () => { if (node.parentNode) node.remove(); };
    node.src = im.url;
    if (node.complete && node.naturalWidth > 0) activate();
    layer.appendChild(node);
    setTimeout(() => olds.forEach((o) => o.remove()), 950);

    preloadClipNeighbors(index);
  }

  function preloadClipNeighbors(index) {
    const images = state.clips.images;
    for (let i = 1; i <= CLIPS_PRELOAD_AHEAD; i++) {
      const im = images[(index + i) % images.length];
      if (im) preloadUrl(im.url);
    }
  }

  function restartClipsTimer() {
    clearTimeout(state.clips.timer);
    resetClipsBar(true);
    state.clips.timer = setTimeout(advanceClips, CLIPS_INTERVAL_MS);
  }

  function advanceClips() {
    if (!state.clips.active || !state.clips.images.length) return;
    state.clips.index = (state.clips.index + 1) % state.clips.images.length;
    renderClip(state.clips.index);
    restartClipsTimer();
  }

  function resetClipsBar(run) {
    const bar = $('#clips-progress-bar');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    if (run) {
      bar.style.transition = `width ${CLIPS_INTERVAL_MS}ms linear`;
      bar.style.width = '100%';
    }
  }

  function closeClips() {
    if (!state.clips.active) return;
    clearTimeout(state.clips.timer);
    state.clips.active = false;
    state.clips.images = [];
    state.clips.forId = null;
    $('#clips-layer').classList.remove('is-open');
    $('#btn-clips').setAttribute('aria-pressed', 'false');
    $('#clips-backdrop').innerHTML = '';
    $('#clips-empty').classList.add('hidden');
    $('#clips-progress').classList.add('hidden');
    resetClipsBar(false);
    // Resume the main slideshow if it was running when clips opened.
    if (state.slideshow) restartSlideTimer();
  }

  // ---- Controls / fullscreen ---------------------------------------------

  let _controlsBound = false;
  function bindPlayerControls() {
    $('#btn-prev').onclick = () => step(-1);
    $('#btn-next').onclick = () => step(1);
    $('#btn-slideshow').onclick = onSlideshowButton;
    $('#btn-clips').onclick = toggleClips;
    $('#btn-fullscreen').onclick = toggleFullscreen;
    $('#btn-config').onclick = openFilterOverlay;
    $('#btn-exit').onclick = exitPlayer;
    $('#btn-filter-close').onclick = closeFilterOverlay;
    // Click the dimmed area outside the filter sheet to close it.
    $('#filter-overlay').onclick = (e) => { if (e.target.id === 'filter-overlay') closeFilterOverlay(); };
    if (!_controlsBound) {
      document.addEventListener('keydown', onKey);
      // In fullscreen the browser eats Esc to exit fullscreen before the page
      // ever sees the keydown, so onKey never fires for it. Treat leaving
      // fullscreen while clips are open as the close signal, so Esc closes the
      // clips panel as the user expects.
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && state.clips.active) closeClips();
      });
      // Close the slide picker on any outside click.
      document.addEventListener('pointerdown', (e) => {
        const picker = $('#slide-picker');
        if (!picker.classList.contains('is-open')) return;
        if (picker.contains(e.target) || $('#btn-slideshow').contains(e.target)) return;
        toggleSlidePicker(false);
      });
      _controlsBound = true;
    }
  }

  function onKey(e) {
    if ($('#stage-player').classList.contains('hidden')) return;
    const overlayOpen = $('#filter-overlay').classList.contains('is-open');
    const pickerOpen = $('#slide-picker').classList.contains('is-open');
    const clipsOpen = state.clips.active;
    // Esc closes any open overlay/picker/clips first.
    if (e.key === 'Escape') {
      if (overlayOpen) { closeFilterOverlay(); return; }
      if (pickerOpen) { toggleSlidePicker(false); return; }
      if (clipsOpen) { closeClips(); return; }
      exitPlayer();
      return;
    }
    // While the filter sheet or slide picker is open let it own the keyboard.
    if (overlayOpen || pickerOpen) return;
    // While clips are playing, G closes them; ignore the other player keys so
    // they don't drive the title underneath.
    if (clipsOpen) {
      if (e.key === 'g' || e.key === 'G') { e.preventDefault(); closeClips(); }
      return;
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') { e.preventDefault(); quickToggleSlideshow(); }
    else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); toggleClips(); }
  }

  // ---- In-player filter overlay (translucent, live) ---------------------

  function openFilterOverlay() {
    toggleSlidePicker(false);
    buildFilterUI('pf', applyLiveFilter);
    updatePfMatch(state.ordered.length);
    $('#filter-overlay').classList.add('is-open');
    const closeBtn = $('#btn-filter-close');
    if (closeBtn) closeBtn.focus();
  }

  function updatePfMatch(n) {
    const el = $('#pf-match');
    if (!el) return;
    el.textContent = n === 0 ? 'No matches' : `${n} match${n === 1 ? '' : 'es'}`;
    el.classList.toggle('is-empty', n === 0);
  }

  function closeFilterOverlay() {
    $('#filter-overlay').classList.remove('is-open');
  }

  // Re-apply the current config to the live playback without leaving the
  // player: recompute the ordered set, keep already-resolved images, fetch any
  // newly-included items, and keep the current title visible if it still passes.
  function applyLiveFilter() {
    const prevId = state.currentId;
    const next = computeFiltered();
    state.ordered = next;

    const nextIds = new Set(next.map(idOf));
    // Prune status for items no longer in the set; seed new ones as pending.
    for (const id of Array.from(state.statusById.keys())) {
      if (!nextIds.has(id)) state.statusById.delete(id);
    }
    for (const m of next) {
      const id = idOf(m);
      if (!state.statusById.has(id)) state.statusById.set(id, 'pending');
    }

    rebuildDisplayOrder();
    updatePfMatch(next.length);

    if (next.length === 0) {
      // Nothing matches — hold on the current frame and pause auto-advance
      // (otherwise the slide timer keeps firing over an empty set). Playback
      // resumes automatically when a later change yields matches again.
      clearTimeout(state.slideTimer);
      resetSlideBar(false);
      return;
    }

    // Keep showing the current title if it still qualifies; else jump to first.
    if (nextIds.has(prevId)) {
      state.currentId = prevId;
      updateCounter();
    } else {
      const firstReady = state.displayOrder.find((id) => state.statusById.get(id) === 'complete') || state.displayOrder[0];
      goTo(firstReady);
    }
    if (state.slideshow) { state.shuffleBag = []; restartSlideTimer(); }

    startFetchEngine();
  }

  function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  function backToConfig() {
    teardownPlayback();
    openConfig();
  }

  function exitPlayer() {
    teardownPlayback();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    
    if (params.get('aiMovies') === '1') {
      window.close();
      // Fallback if window.close() is blocked
      setTimeout(() => {
        location.href = '../embeddings/embeddings.html';
      }, 300);
      return;
    }
    
    // Tabs opened via chrome.tabs.create usually can't be closed by window.close;
    // fall back to the config screen so the user is never stranded.
    openConfig();
  }

  function teardownPlayback() {
    if (state.abort) state.abort.abort();
    if (_displayRaf) { cancelAnimationFrame(_displayRaf); _displayRaf = 0; }
    closeClips();
    stopSlideshow();
    closeFilterOverlay();
    toggleSlidePicker(false);
    // Keep the keydown handler bound across config<->player transitions; it
    // early-returns whenever the player stage is hidden.
  }

  // ---- utils -------------------------------------------------------------

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(v) { return escapeHtml(v); }

  // ---- go ----------------------------------------------------------------

  boot();
})();
