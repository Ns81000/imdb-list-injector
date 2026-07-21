// src/embeddings/embeddings.js
//
// AI Clustering page controller. Flow:
//   status check (Ollama) -> sync (embedding vectors) -> cluster (DBSCAN) -> render
//
// Embeddings are stored in IndexedDB (ZoomOutEmbeddings) to avoid bloating
// chrome.storage.local. Keywords come from the extension's saved lists.

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const MODEL_HINT = 'qwen3-embedding';   // prefix used for detection
  const MODEL_FALLBACK = 'qwen3-embedding:0.6b';
  const MIN_KEYWORD_OCCURRENCES = 2;
  const BATCH_SIZE = 50;

  const ACCENT_CLASSES = [
    'cluster-accent-0', 'cluster-accent-1', 'cluster-accent-2',
    'cluster-accent-3', 'cluster-accent-4', 'cluster-accent-5'
  ];

  const state = {
    detectedModel: MODEL_FALLBACK,
    selectedKeywords: new Set(),
    keywordCounts: new Map(),   // keyword -> occurrence count across lists
    embeddings: new Map(),      // keyword -> Float32Array
    orderedKeywords: [],        // [string] ordered by semantic similarity
    searchTerm: ''
  };

  let currentMode = 'watching';

  // ---- Stage switching ---------------------------------------------------

  function showStage(id) {
    document.querySelectorAll('.stage').forEach((el) => el.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  // ---- Ollama Detection --------------------------------------------------

  let statusRetryTimer = null;

  async function checkOllamaStatus() {
    const indicator = $('#status-indicator');
    const dot = indicator.querySelector('.status-dot');
    const label = indicator.querySelector('.status-label');
    const sub = $('#status-sub');

    dot.className = 'status-dot pulsing';
    label.textContent = 'Checking…';

    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'OLLAMA_TAGS' }, resolve);
      });

      if (!resp || !resp.success || !resp.data || !Array.isArray(resp.data.models)) {
        throw new Error(resp?.error || 'Ollama not responding');
      }

      const models = resp.data.models.map((m) => m.name || m.model || '');
      const match = models.find((m) => m.toLowerCase().includes(MODEL_HINT));

      if (match) {
        state.detectedModel = match;
      } else if (models.length > 0) {
        state.detectedModel = models[0];
      } else {
        throw new Error('No models found in Ollama');
      }

      dot.className = 'status-dot online';
      label.textContent = 'Ollama Ready';
      sub.textContent = `Using model: ${state.detectedModel}`;
      return true;

    } catch (err) {
      dot.className = 'status-dot offline';
      label.textContent = 'Ollama Offline';
      sub.textContent = 'Make sure Ollama is running locally at http://localhost:11434 with CORS enabled.';

      showStage('#stage-status');
      const statusTitle = document.querySelector('#stage-status .panel-title');
      const statusSub = document.querySelector('#stage-status #status-sub');

      if (statusTitle) statusTitle.textContent = 'Ollama connection failed';
      if (statusSub) statusSub.textContent = err.message || 'Ollama is not responding.';

      $('#sync-status').classList.add('sync-error');
      $('#btn-sync-retry').classList.remove('hidden');
      return false;
    }
  }

  // ---- IndexedDB Helper (ZoomOutEmbeddings) ------------------------------

  const ZoomOutDB = {
    DB_NAME: 'ZoomOutEmbeddings',
    STORE: 'embeddings',
    VERSION: 1,

    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(this.DB_NAME, this.VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(this.STORE)) {
            db.createObjectStore(this.STORE, { keyPath: 'keyword' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    async getAll() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, 'readonly');
        const req = tx.objectStore(this.STORE).getAll();
        req.onsuccess = () => {
          const map = new Map();
          for (const item of req.result || []) {
            map.set(item.keyword, item.vector);
          }
          resolve(map);
        };
        req.onerror = () => reject(req.error);
      });
    },

    async getMany(keywords) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, 'readonly');
        const store = tx.objectStore(this.STORE);
        const map = new Map();
        let count = 0;
        if (keywords.length === 0) return resolve(map);

        for (const kw of keywords) {
          const req = store.get(kw);
          req.onsuccess = () => {
            if (req.result) map.set(req.result.keyword, req.result.vector);
            count++;
            if (count === keywords.length) resolve(map);
          };
          req.onerror = () => {
            count++;
            if (count === keywords.length) resolve(map);
          };
        }
      });
    },

    async putMany(items) {
      if (items.length === 0) return;
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, 'readwrite');
        const store = tx.objectStore(this.STORE);
        for (const { keyword, vector } of items) {
          store.put({ keyword, vector, updatedAt: Date.now() });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async deleteMany(keywords) {
      if (keywords.length === 0) return;
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.STORE, 'readwrite');
        const store = tx.objectStore(this.STORE);
        for (const kw of keywords) store.delete(kw);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };

  // ---- Keyword Extraction ------------------------------------------------

  function extractKeywords() {
    return new Promise((resolve) => {
      const key = StorageHelper.getStorageKey('imdb_lists', currentMode);
      chrome.storage.local.get(key, (data) => {
        const lists = Array.isArray(data[key]) ? data[key] : [];
        const counts = new Map();
        const kwMovies = new Map();
        const seenMovies = new Set();

        for (const list of lists) {
          if (!list || !Array.isArray(list.movies)) continue;
          for (const movie of list.movies) {
            if (!movie || typeof movie !== 'object') continue;
            const id = String(movie.imdb_id || '').trim();
            const movieKey = id || `t:${movie.title}|${movie.year}`;
            if (seenMovies.has(movieKey)) continue;
            seenMovies.add(movieKey);

            if (!Array.isArray(movie.keywords)) continue;
            for (const kw of movie.keywords) {
              const clean = String(kw).trim().toLowerCase();
              if (!clean) continue;
              counts.set(clean, (counts.get(clean) || 0) + 1);

              if (!kwMovies.has(clean)) kwMovies.set(clean, new Set());
              kwMovies.get(clean).add(movieKey);
            }
          }
        }

        const filtered = new Map();
        for (const [kw, c] of counts.entries()) {
          if (c >= MIN_KEYWORD_OCCURRENCES) {
            filtered.set(kw, c);
          }
        }

        state.keywordToMovies = kwMovies;
        resolve({ keywordCounts: filtered });
      });
    });
  }

  // ---- Embedding Generation (Ollama API Proxy) ---------------------------

  async function fetchEmbeddingsBatch(keywords) {
    const resp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'OLLAMA_EMBED',
        model: state.detectedModel,
        input: keywords
      }, resolve);
    });

    if (!resp || !resp.success) {
      throw new Error(resp?.error || 'Failed to fetch embeddings from Ollama');
    }

    const embeddings = resp.data.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== keywords.length) {
      throw new Error('Mismatched embedding response length from Ollama');
    }

    const resultMap = new Map();
    for (let i = 0; i < keywords.length; i++) {
      resultMap.set(keywords[i], new Float32Array(embeddings[i]));
    }
    return resultMap;
  }

  // ---- Embedding Sync Workflow -------------------------------------------

  async function syncEmbeddings(keywordCounts) {
    const statusEl = $('#sync-status');
    const statsEl = $('#sync-stats');
    const barEl = $('#sync-bar');

    $('#btn-sync-retry').classList.add('hidden');
    statusEl.classList.remove('sync-error');
    statusEl.textContent = 'Connecting to Ollama…';
    barEl.style.width = '5%';

    // 1. Check Ollama server
    const ready = await checkOllamaStatus();
    if (!ready) return;

    // 2. Load cache
    let cached;
    try {
      cached = await ZoomOutDB.getAll();
    } catch {
      cached = new Map();
    }

    // 3. Compute diff
    const currentKeys = new Set(keywordCounts.keys());
    const newKeywords = [];
    const obsoleteKeywords = [];

    for (const kw of currentKeys) {
      if (!cached.has(kw)) newKeywords.push(kw);
    }
    for (const kw of cached.keys()) {
      if (!currentKeys.has(kw)) obsoleteKeywords.push(kw);
    }

    // If zero changes, instantly return!
    if (newKeywords.length === 0 && obsoleteKeywords.length === 0) {
      statusEl.textContent = 'Database is completely up to date!';
      barEl.style.width = '100%';
      statsEl.textContent = 'No additions or deletions found.';
      state.embeddings = cached;

      const orderKey = StorageHelper.getStorageKey('ai_cluster_order', currentMode);
      const orderData = await new Promise((resolve) => {
        chrome.storage.local.get(orderKey, resolve);
      });
      state.orderedKeywords = orderData[orderKey] || Array.from(cached.keys());

      setTimeout(() => {
        renderSemanticFlow();
        showStage('#stage-clusters');
      }, 800);
      return;
    }

    // 4. Delete obsolete
    if (obsoleteKeywords.length > 0) {
      statusEl.textContent = `Cleaning ${obsoleteKeywords.length} obsolete embeddings…`;
      barEl.style.width = '15%';
      try {
        await ZoomOutDB.deleteMany(obsoleteKeywords);
      } catch { /* non-critical */ }
      for (const kw of obsoleteKeywords) cached.delete(kw);
    }

    // 5. Fetch new embeddings in batches
    let lastError = '';
    if (newKeywords.length > 0) {
      statusEl.textContent = `Embedding ${newKeywords.length} keywords via ${state.detectedModel}…`;
      const totalBatches = Math.ceil(newKeywords.length / BATCH_SIZE);
      let completedBatches = 0;

      try {
        statusEl.textContent = `Loading model ${state.detectedModel}…`;
        const probe = await fetchEmbeddingsBatch([newKeywords[0]]);
        const probeVec = probe.get(newKeywords[0]);
        if (probeVec) {
          cached.set(newKeywords[0], probeVec);
          await ZoomOutDB.putMany([{ keyword: newKeywords[0], vector: probeVec }]);
        }
        newKeywords.shift();
      } catch (err) {
        lastError = err.message || String(err);
        statusEl.textContent = `Embedding probe failed: ${lastError}`;
        statusEl.classList.add('sync-error');
        statsEl.textContent = 'The model could not produce embeddings. Check Ollama logs.';
        $('#btn-sync-retry').classList.remove('hidden');
        return;
      }

      for (let i = 0; i < newKeywords.length; i += BATCH_SIZE) {
        const batch = newKeywords.slice(i, i + BATCH_SIZE);
        try {
          const batchResult = await fetchEmbeddingsBatch(batch);
          const toSave = [];
          for (const [kw, vec] of batchResult) {
            cached.set(kw, vec);
            toSave.push({ keyword: kw, vector: vec });
          }
          await ZoomOutDB.putMany(toSave);
        } catch (err) {
          lastError = err.message || String(err);
          statusEl.textContent = `Embedding error: ${lastError}`;
          statusEl.classList.add('sync-error');
          statsEl.textContent = `Embedded ${cached.size} keywords so far.`;
          break;
        }

        completedBatches++;
        const pct = 15 + Math.round((completedBatches / totalBatches) * 75);
        barEl.style.width = `${pct}%`;
        statsEl.textContent = `${cached.size} keywords embedded`;
      }
    }

    if (cached.size === 0) {
      barEl.style.width = '100%';
      statusEl.textContent = lastError ? `Embedding failed: ${lastError}` : 'Could not generate any embeddings.';
      statusEl.classList.add('sync-error');
      statsEl.textContent = `${state.keywordCounts.size} keywords found but none could be embedded.`;
      $('#btn-sync-retry').classList.remove('hidden');
      return;
    }

    barEl.style.width = '95%';
    statusEl.textContent = 'Sorting Keywords...';
    statsEl.textContent = 'Computing semantic alignment map...';

    state.embeddings = cached;
    const ordered = await sortSemantically(cached, state.keywordCounts);
    state.orderedKeywords = ordered;

    const orderKeySave = StorageHelper.getStorageKey('ai_cluster_order', currentMode);
    await new Promise((resolve) => {
      chrome.storage.local.set({ [orderKeySave]: ordered }, resolve);
    });

    barEl.style.width = '100%';
    statusEl.textContent = `Aligned ${cached.size} keywords by similarity.`;
    statsEl.textContent = '';

    setTimeout(() => {
      renderSemanticFlow();
      showStage('#stage-clusters');
    }, 600);
  }

  // ---- Semantic Sorting (1D Alignment) -----------------------------------

  function cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  async function sortSemantically(embeddings, keywordCounts) {
    const keywords = Array.from(embeddings.keys());
    const n = keywords.length;
    if (n === 0) return [];

    const vecs = keywords.map((kw) => embeddings.get(kw));
    const unvisited = new Set();
    for (let i = 0; i < n; i++) unvisited.add(i);

    const ordered = [];
    let currentIdx = 0;
    let maxCount = -1;
    for (let i = 0; i < n; i++) {
      const c = keywordCounts.get(keywords[i]) || 0;
      if (c > maxCount) {
        maxCount = c;
        currentIdx = i;
      }
    }

    unvisited.delete(currentIdx);
    ordered.push(keywords[currentIdx]);

    let ops = 0;
    while (unvisited.size > 0) {
      let bestDist = -Infinity;
      let bestIdx = -1;
      const currentVec = vecs[currentIdx];

      for (const next of unvisited) {
        const dist = cosineSimilarity(currentVec, vecs[next]);
        if (dist > bestDist) {
          bestDist = dist;
          bestIdx = next;
        }
      }

      currentIdx = bestIdx;
      unvisited.delete(currentIdx);
      ordered.push(keywords[currentIdx]);

      ops++;
      if (ops % 50 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return ordered;
  }

  // ---- Flow UI Rendering -------------------------------------------------

  function renderSemanticFlow() {
    renderKeywords();
    updateSelectionCount();
  }

  function renderKeywords() {
    const body = $('#clusters-body');
    body.innerHTML = '';

    const countSpan = $('#total-keywords-count');
    if (countSpan) countSpan.textContent = `(${state.orderedKeywords.length})`;

    const search = state.searchTerm.toLowerCase();
    let matchCount = 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'semantic-flow-container';

    for (let i = 0; i < state.orderedKeywords.length; i++) {
      const kw = state.orderedKeywords[i];
      const count = state.keywordCounts.get(kw) || 0;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pill';
      btn.dataset.keyword = kw;
      btn.innerHTML = `${escapeHtml(kw)}<span class="pill-count">${count}</span>`;
      btn.setAttribute('aria-pressed', String(state.selectedKeywords.has(kw)));

      if (search) {
        if (kw.includes(search)) {
          btn.classList.add('search-match');
          matchCount++;
        } else {
          btn.classList.add('search-dim');
        }
      }

      btn.addEventListener('click', () => {
        toggleKeyword(kw);
        btn.setAttribute('aria-pressed', String(state.selectedKeywords.has(kw)));
        updateSelectionCount();
      });

      wrapper.appendChild(btn);
    }

    body.appendChild(wrapper);

    const searchCountSpan = $('#search-count');
    if (searchCountSpan) {
      if (search) {
        searchCountSpan.textContent = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
        searchCountSpan.classList.remove('hidden');
      } else {
        searchCountSpan.classList.add('hidden');
      }
    }
  }

  function toggleKeyword(kw) {
    if (state.selectedKeywords.has(kw)) {
      state.selectedKeywords.delete(kw);
    } else {
      state.selectedKeywords.add(kw);
    }
  }

  function updateSelectionCount() {
    const count = state.selectedKeywords.size;
    if (count === 0) {
      $('#selection-count').textContent = '0 keywords selected';
      $('#btn-start-immersive').disabled = true;
      return;
    }

    const matchingMovies = new Set();
    for (const kw of state.selectedKeywords) {
      const movies = state.keywordToMovies ? state.keywordToMovies.get(kw) : null;
      if (movies) {
        for (const m of movies) matchingMovies.add(m);
      }
    }

    const movieCount = matchingMovies.size;
    $('#selection-count').textContent = `${count} keyword${count === 1 ? '' : 's'} selected (${movieCount} item${movieCount === 1 ? '' : 's'})`;
    $('#btn-start-immersive').disabled = false;
  }

  function bindGlobalControls() {
    const btnResync = $('#btn-resync');
    if (btnResync) btnResync.addEventListener('click', doResync);

    const btnRetry = $('#btn-sync-retry');
    if (btnRetry) btnRetry.addEventListener('click', doResync);

    const btnClear = $('#btn-clear-selection');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        state.selectedKeywords.clear();
        renderKeywords();
        updateSelectionCount();
      });
    }

    const searchInput = $('#search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchTerm = e.target.value.trim();
        renderKeywords();
      });
    }

    const btnStart = $('#btn-start-immersive');
    if (btnStart) {
      btnStart.addEventListener('click', async () => {
        if (state.selectedKeywords.size === 0) return;

        const keywords = state.selectedKeywords;
        const listsKey = StorageHelper.getStorageKey('imdb_lists', currentMode);
        const matchingIds = await new Promise((resolve) => {
          chrome.storage.local.get(listsKey, (data) => {
            const lists = Array.isArray(data[listsKey]) ? data[listsKey] : [];
            const ids = new Set();
            for (const list of lists) {
              if (!list || !Array.isArray(list.movies)) continue;
              for (const movie of list.movies) {
                if (!movie || typeof movie !== 'object') continue;
                if (Array.isArray(movie.keywords)) {
                  const hasMatch = movie.keywords.some(kw => keywords.has(String(kw).trim().toLowerCase()));
                  if (hasMatch) {
                    const id = String(movie.imdb_id || '').trim();
                    const key = id || `t:${movie.title}|${movie.year}`;
                    ids.add(key);
                  }
                }
              }
            }
            resolve(Array.from(ids));
          });
        });

        if (matchingIds.length === 0) {
          alert('No movies found matching these keywords.');
          return;
        }

        const aiClusterMoviesKey = StorageHelper.getStorageKey('ai_cluster_movies', currentMode);
        try {
          await chrome.storage.session.set({ [aiClusterMoviesKey]: matchingIds });
        } catch {
          await new Promise((resolve) => {
            chrome.storage.local.set({ [aiClusterMoviesKey]: matchingIds }, resolve);
          });
        }

        const hasKey = await new Promise((resolve) => {
          chrome.storage.local.get('imdb_tmdb_key', (data) => {
            resolve(!!(data && data.imdb_tmdb_key));
          });
        });

        if (!hasKey) {
          alert('Add your TMDB API key in the extension settings (popup → Settings) to use Immersive mode.');
          return;
        }

        const url = chrome.runtime.getURL(
          `src/immersive/immersive.html?scope=all&aiMovies=1&mode=${currentMode}`
        );
        chrome.tabs.create({ url });
      });
    }
  }

  function doResync() {
    state.selectedKeywords.clear();
    state.embeddings.clear();
    const statusEl = $('#sync-status');
    if (statusEl) statusEl.classList.remove('sync-error');
    $('#btn-sync-retry').classList.add('hidden');
    showStage('#stage-status');
    checkOllamaStatus();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---- Boot --------------------------------------------------------------

  async function boot() {
    bindGlobalControls();

    const urlParams = new URLSearchParams(window.location.search);
    const paramMode = urlParams.get('mode');
    currentMode = paramMode ? StorageHelper.normalizeMode(paramMode) : await StorageHelper.getActiveMode();

    const ok = await checkOllamaStatus();
    if (!ok) return;

    const { keywordCounts } = await extractKeywords();
    state.keywordCounts = keywordCounts;

    if (keywordCounts.size === 0) {
      showStage('#stage-empty');
      return;
    }

    showStage('#stage-status');
    const statusTitle = document.querySelector('#stage-status .panel-title');
    const statusSub = document.querySelector('#stage-status #status-sub');
    if (statusTitle) statusTitle.textContent = 'Checking Embeddings';
    if (statusSub) statusSub.textContent = 'Loading cached keyword vectors...';

    const allKeywords = Array.from(keywordCounts.keys());
    const cachedMap = await ZoomOutDB.getMany(allKeywords);

    if (cachedMap.size === allKeywords.length) {
      let valid = true;
      for (const vec of cachedMap.values()) {
        if (!vec || vec.length === 0) { valid = false; break; }
      }
      if (valid) {
        state.embeddings = cachedMap;

        const orderKey = StorageHelper.getStorageKey('ai_cluster_order', currentMode);
        const orderData = await new Promise((resolve) => {
          chrome.storage.local.get(orderKey, resolve);
        });

        let cachedOrder = orderData[orderKey] || [];
        cachedOrder = cachedOrder.filter(k => cachedMap.has(k));

        if (cachedOrder.length !== cachedMap.size) {
          state.orderedKeywords = await sortSemantically(cachedMap, keywordCounts);
          await new Promise((resolve) => {
            chrome.storage.local.set({ [orderKey]: state.orderedKeywords }, resolve);
          });
        } else {
          state.orderedKeywords = cachedOrder;
        }

        showStage('#stage-clusters');
        renderSemanticFlow();
        return;
      }
    }

    syncEmbeddings(keywordCounts);
  }

  boot();

})();
