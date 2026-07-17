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
    sub.textContent = 'Looking for a local Ollama instance…';

    hideSetupCards();

    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'OLLAMA_TAGS' }, resolve);
      });

      if (!response || !response.success) throw new Error(response?.error || 'No response');

      const data = response.data;
      const models = Array.isArray(data.models) ? data.models : [];
      const match = models.find((m) =>
        (m.name && m.name.startsWith(MODEL_HINT)) ||
        (m.model && m.model.startsWith(MODEL_HINT))
      );

      if (match) {
        // Store the exact name Ollama knows this model by
        state.detectedModel = match.model || match.name || MODEL_FALLBACK;

        dot.className = 'status-dot connected';
        label.textContent = 'Connected';
        sub.textContent = `Model: ${state.detectedModel}`;
        $('#setup-ready').classList.remove('hidden');

        clearInterval(statusRetryTimer);
        statusRetryTimer = null;

        // Auto-proceed after a brief moment
        setTimeout(() => startSync(), 800);
      } else {
        dot.className = 'status-dot offline';
        label.textContent = 'Model missing';
        sub.textContent = 'Ollama is running but the embedding model needs to be installed.';
        $('#setup-model').classList.remove('hidden');
      }
    } catch {
      dot.className = 'status-dot offline';
      label.textContent = 'Offline';
      sub.textContent = 'Could not connect to a local Ollama instance.';
      $('#setup-offline').classList.remove('hidden');
    }
  }

  function hideSetupCards() {
    $('#setup-offline').classList.add('hidden');
    $('#setup-model').classList.add('hidden');
    $('#setup-ready').classList.add('hidden');
  }

  // Bind manual retry buttons
  document.querySelectorAll('.btn-retry-status').forEach(btn => {
    btn.addEventListener('click', checkOllamaStatus);
  });

  // ---- Copy Command Button -----------------------------------------------

  document.querySelectorAll('.btn-copy-cmd').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const codeBlock = e.currentTarget.closest('.code-block');
      const textEl = codeBlock.querySelector('.pull-command-text');
      if (!textEl) return;
      
      const text = textEl.textContent;
      const originalHTML = btn.innerHTML;
      try {
        await navigator.clipboard.writeText(text);
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        btn.title = 'Copied!';
        setTimeout(() => { 
          btn.innerHTML = originalHTML;
          btn.title = 'Copy to clipboard'; 
        }, 2000);
      } catch {
        // Fallback: select the text
        const range = document.createRange();
        range.selectNodeContents(textEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  });

  // ---- Keyword Extraction ------------------------------------------------

  function extractKeywords() {
    return new Promise((resolve) => {
      chrome.storage.local.get('imdb_lists', (data) => {
        const lists = Array.isArray(data.imdb_lists) ? data.imdb_lists : [];
        const counts = new Map();
        const kwMovies = new Map();
        const seenMovies = new Set();
        let totalUnique = 0;

        for (const list of lists) {
          if (!list || !Array.isArray(list.movies)) continue;
          for (const movie of list.movies) {
            if (!movie || typeof movie !== 'object') continue;
            const id = String(movie.imdb_id || '').trim();
            const key = id || `t:${movie.title}|${movie.year}`;
            if (seenMovies.has(key)) continue;
            seenMovies.add(key);

            if (!Array.isArray(movie.keywords)) continue;
            for (const kw of movie.keywords) {
              const clean = String(kw).trim().toLowerCase();
              if (!clean) continue;
              if (!counts.has(clean)) totalUnique++;
              counts.set(clean, (counts.get(clean) || 0) + 1);
              if (!kwMovies.has(clean)) kwMovies.set(clean, new Set());
              kwMovies.get(clean).add(key);
            }
          }
        }

        state.keywordCounts = counts;
        state.keywordToMovies = kwMovies;

        // Filter by minimum occurrences
        const filtered = new Map();
        for (const [kw, count] of counts) {
          if (count >= MIN_KEYWORD_OCCURRENCES) {
            filtered.set(kw, count);
          }
        }

        resolve({ filtered, totalUnique });
      });
    });
  }

  // ---- IndexedDB Embedding Cache -----------------------------------------

  const DB_NAME = 'ZoomOutEmbeddings';
  const DB_VERSION = 1;
  const STORE_NAME = 'vectors';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'keyword' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadCachedEmbeddings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const map = new Map();
        for (const entry of req.result) {
          if (entry.keyword && entry.vector) {
            map.set(entry.keyword, new Float32Array(entry.vector));
          }
        }
        resolve(map);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function saveBatchEmbeddings(entries) {
    if (entries.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const { keyword, vector } of entries) {
        store.put({ keyword, vector: Array.from(vector), timestamp: Date.now() });
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function deleteObsoleteEmbeddings(obsoleteKeys) {
    if (obsoleteKeys.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const key of obsoleteKeys) {
        store.delete(key);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // ---- Ollama Embedding Client -------------------------------------------

  async function fetchEmbeddingsBatch(keywords) {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'OLLAMA_EMBED', model: state.detectedModel, input: keywords },
        resolve
      );
    });

    if (!response || !response.success) {
      throw new Error(`Ollama API error: ${response?.error || 'No response'}`);
    }

    const embeddings = response.data.embeddings;

    if (!Array.isArray(embeddings) || embeddings.length !== keywords.length) {
      throw new Error('Ollama returned unexpected embedding count');
    }

    const result = new Map();
    for (let i = 0; i < keywords.length; i++) {
      result.set(keywords[i], new Float32Array(embeddings[i]));
    }
    return result;
  }

  // ---- Incremental Sync Engine -------------------------------------------

  async function startSync() {
    showStage('#stage-sync');

    const statusEl = $('#sync-status');
    const barEl = $('#sync-bar');
    const statsEl = $('#sync-stats');

    statusEl.textContent = 'Extracting keywords from your lists…';
    barEl.style.width = '0%';
    statsEl.textContent = '';

    // 1. Extract keywords
    const extraction = await extractKeywords();
    const keywordCounts = extraction.filtered;
    state.keywordCounts = keywordCounts;

    if (keywordCounts.size === 0) {
      showStage('#stage-empty');
      return;
    }

    const dropped = extraction.totalUnique - keywordCounts.size;
    statusEl.textContent = `Found ${keywordCounts.size} recurring keywords (skipped ${dropped} single-use). Loading cache…`;
    barEl.style.width = '10%';

    // 2. Load cache
    let cached;
    try {
      cached = await loadCachedEmbeddings();
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
    
    // If absolutely zero changes, instantly return!
    if (newKeywords.length === 0 && obsoleteKeywords.length === 0) {
      statusEl.textContent = 'Database is completely up to date!';
      barEl.style.width = '100%';
      statsEl.textContent = 'No additions or deletions found.';
      state.embeddings = cached;
      
      // Load cached order instantly
      const orderData = await new Promise((resolve) => {
        chrome.storage.local.get('ai_cluster_order', resolve);
      });
      state.orderedKeywords = orderData.ai_cluster_order || Array.from(cached.keys());
      
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
        await deleteObsoleteEmbeddings(obsoleteKeywords);
      } catch { /* non-critical */ }
      
      // Remove obsolete from local cache map
      for (const kw of obsoleteKeywords) {
        cached.delete(kw);
      }
    }

    // 5. Fetch new embeddings in batches
    let lastError = '';
    if (newKeywords.length > 0) {
      statusEl.textContent = `Embedding ${newKeywords.length} keywords via ${state.detectedModel}…`;
      const totalBatches = Math.ceil(newKeywords.length / BATCH_SIZE);
      let completedBatches = 0;

      // Probe: send a single keyword first to verify the API works and let
      // Ollama load the model into memory before we hit it with full batches.
      try {
        statusEl.textContent = `Loading model ${state.detectedModel}… (first call may take a moment)`;
        const probe = await fetchEmbeddingsBatch([newKeywords[0]]);
        const probeVec = probe.get(newKeywords[0]);
        if (probeVec) {
          cached.set(newKeywords[0], probeVec);
          await saveBatchEmbeddings([{ keyword: newKeywords[0], vector: probeVec }]);
        }
        // Remove the probed keyword from the remaining list
        newKeywords.shift();
      } catch (err) {
        lastError = err.message || String(err);
        statusEl.textContent = `Embedding probe failed: ${lastError}`;
        statusEl.classList.add('sync-error');
        statsEl.textContent = 'The model could not produce embeddings. Check Ollama logs.';
        $('#btn-sync-retry').classList.remove('hidden');
        return;
      }

      if (newKeywords.length > 0) {
        statusEl.textContent = `Fetching embeddings for ${newKeywords.length} remaining keywords…`;
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
          await saveBatchEmbeddings(toSave);
        } catch (err) {
          lastError = err.message || String(err);
          statusEl.textContent = `Embedding error: ${lastError}`;
          statusEl.classList.add('sync-error');
          statsEl.textContent = `Embedded ${cached.size} keywords so far. Will cluster what we have.`;
          // Continue with what we have
          break;
        }

        completedBatches++;
        const pct = 15 + Math.round((completedBatches / totalBatches) * 75);
        barEl.style.width = `${pct}%`;
        statsEl.textContent = `${cached.size} / ${cached.size + newKeywords.length - Math.min(i + BATCH_SIZE, newKeywords.length)} keywords embedded`;
      }
    }

    // 6. Guard: if no embeddings at all, stay on sync screen with error
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

    // 7. Store and sort semantically
    state.embeddings = cached;
    const ordered = await sortSemantically(cached, state.keywordCounts);
    state.orderedKeywords = ordered;
    
    // Cache the ordered array
    await new Promise((resolve) => {
      chrome.storage.local.set({ ai_cluster_order: ordered }, resolve);
    });

    barEl.style.width = '100%';
    statusEl.textContent = `Aligned ${cached.size} keywords by similarity.`;
    statsEl.textContent = '';

    // 8. Switch to cluster view
    setTimeout(() => {
      renderSemanticFlow();
      showStage('#stage-clusters');
    }, 600);
  }

  // ---- Semantic Sorting (1D Alignment) -----------------------------------

  function cosineSimilarity(a, b) {
    // Vectors from Ollama are L2-normalized, so dot product = cosine sim.
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  async function sortSemantically(embeddings, keywordCounts) {
    const keywords = Array.from(embeddings.keys());
    const n = keywords.length;
    if (n === 0) return [];

    // Pre-calculate vectors
    const vecs = keywords.map((kw) => embeddings.get(kw));
    const unvisited = new Set();
    for (let i = 0; i < n; i++) unvisited.add(i);

    const ordered = [];
    
    // Start with the most frequent keyword
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

    // Greedy nearest-neighbor search
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
    bindClusterControls();
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

      // Search highlighting
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
    
    // Calculate matching movies (union of all selected keywords)
    const matchingMovies = new Set();
    for (const kw of state.selectedKeywords) {
      const movies = state.keywordToMovies.get(kw);
      if (movies) {
        for (const m of movies) matchingMovies.add(m);
      }
    }
    
    const movieCount = matchingMovies.size;
    $('#selection-count').textContent = `${count} keyword${count === 1 ? '' : 's'} selected (${movieCount} item${movieCount === 1 ? '' : 's'})`;
    $('#btn-start-immersive').disabled = false;
  }

  function bindClusterControls() {
    // Search (re-bound each render since the input may be fresh)
    const searchInput = $('#search-input');
    $('#search-input').addEventListener('input', (e) => {
      state.searchTerm = e.target.value.trim();
      renderKeywords();
    });
  }

  // Bind all static buttons once at boot so they work regardless of which
  // stage is visible (fixes Re-sync being dead on the error path).
  function bindGlobalControls() {
    // Re-sync (clusters header)
    $('#btn-resync').addEventListener('click', doResync);

    // Retry (sync screen)
    $('#btn-sync-retry').addEventListener('click', doResync);

    // Clear selection
    $('#btn-clear-selection').addEventListener('click', () => {
      state.selectedKeywords.clear();
      renderKeywords();
      updateSelectionCount();
    });

    // Start Immersive Playback
    $('#btn-start-immersive').addEventListener('click', async () => {
      if (state.selectedKeywords.size === 0) return;

      const keywords = state.selectedKeywords; // Set of strings
      
      // Find all movies that match these keywords
      const matchingIds = await new Promise((resolve) => {
        chrome.storage.local.get('imdb_lists', (data) => {
          const lists = Array.isArray(data.imdb_lists) ? data.imdb_lists : [];
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

      // Store matching movie IDs in session storage for the immersive page to pick up
      try {
        await chrome.storage.session.set({ ai_cluster_movies: matchingIds });
      } catch {
        // Session storage unavailable — fall back to local storage with a cleanup flag
        await new Promise((resolve) => {
          chrome.storage.local.set({ ai_cluster_movies: matchingIds }, resolve);
        });
      }

      // Check for TMDB key first
      const hasKey = await new Promise((resolve) => {
        chrome.storage.local.get('imdb_tmdb_key', (data) => {
          resolve(!!(data && data.imdb_tmdb_key));
        });
      });

      if (!hasKey) {
        alert('Add your TMDB API key in the extension settings (popup → Settings) to use Immersive mode.');
        return;
      }

      // Open immersive with AI movies flag
      const url = chrome.runtime.getURL(
        `src/immersive/immersive.html?scope=all&aiMovies=1`
      );
      chrome.tabs.create({ url });
    });
  }

  function doResync() {
    state.selectedKeywords.clear();
    state.embeddings.clear();
    state.clusters = [];
    // Reset sync-error styling
    const statusEl = $('#sync-status');
    if (statusEl) statusEl.classList.remove('sync-error');
    $('#btn-sync-retry').classList.add('hidden');
    showStage('#stage-status');
    checkOllamaStatus();
  }

  // ---- Helpers -----------------------------------------------------------

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
    
    // Extract keywords immediately for counts
    const extraction = await extractKeywords();
    state.keywordCounts = extraction.filtered;
    
    if (state.keywordCounts.size === 0) {
      showStage('#stage-empty');
      return;
    }
    
    // Load cached embeddings
    let cached = new Map();
    try {
      cached = await loadCachedEmbeddings();
    } catch { }
    
    if (cached.size === 0) {
      // No DB exists, force the sync screen
      showStage('#stage-status');
      checkOllamaStatus();
    } else {
      // Load directly from DB without connecting to Ollama
      const currentKeys = new Set(state.keywordCounts.keys());
      const validEmbeddings = new Map();
      
      for (const [kw, vec] of cached.entries()) {
        if (currentKeys.has(kw)) {
          validEmbeddings.set(kw, vec);
        }
      }
      
      state.embeddings = validEmbeddings;
      
      // Try to load cached order
      const orderData = await new Promise((resolve) => {
        chrome.storage.local.get('ai_cluster_order', resolve);
      });
      
      let cachedOrder = orderData.ai_cluster_order || [];
      // Filter out any obsolete keys from cached order
      cachedOrder = cachedOrder.filter(k => validEmbeddings.has(k));
      
      // If we don't have all the valid keys in the cached order, recompute
      if (cachedOrder.length !== validEmbeddings.size) {
        showStage('#stage-status');
        
        const statusTitle = document.querySelector('#stage-status .panel-title');
        const statusSub = document.querySelector('#stage-status #status-sub');
        if (statusTitle) statusTitle.textContent = 'Sorting Keywords';
        if (statusSub) statusSub.textContent = 'Computing semantic alignment map...';
        
        state.orderedKeywords = await sortSemantically(state.embeddings, state.keywordCounts);
        
        await new Promise((resolve) => {
          chrome.storage.local.set({ ai_cluster_order: state.orderedKeywords }, resolve);
        });
      } else {
        state.orderedKeywords = cachedOrder;
      }
      
      showStage('#stage-clusters');
      renderSemanticFlow();
    }
  }

  boot();

})();
