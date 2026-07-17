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
  const MODEL_NAME = 'qwen3-embedding:0.6b';
  const MIN_KEYWORD_OCCURRENCES = 2;
  const BATCH_SIZE = 50;

  // DBSCAN parameters
  const DBSCAN_EPS = 0.38;    // cosine distance threshold (1 - similarity)
  const DBSCAN_MIN_PTS = 2;   // min cluster size

  const ACCENT_CLASSES = [
    'cluster-accent-0', 'cluster-accent-1', 'cluster-accent-2',
    'cluster-accent-3', 'cluster-accent-4', 'cluster-accent-5'
  ];

  const state = {
    selectedKeywords: new Set(),
    keywordCounts: new Map(),   // keyword -> occurrence count across lists
    embeddings: new Map(),      // keyword -> Float32Array
    clusters: [],               // [{label, keywords: [string]}]
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
      const hasModel = models.some((m) =>
        m.name === MODEL_NAME || m.model === MODEL_NAME ||
        (m.name && m.name.startsWith('qwen3-embedding')) ||
        (m.model && m.model.startsWith('qwen3-embedding'))
      );

      if (hasModel) {
        dot.className = 'status-dot connected';
        label.textContent = 'Connected';
        sub.textContent = 'Local AI is ready.';
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

        scheduleRetry();
      }
    } catch {
      dot.className = 'status-dot offline';
      label.textContent = 'Offline';
      sub.textContent = 'Could not connect to a local Ollama instance.';
      $('#setup-offline').classList.remove('hidden');

      scheduleRetry();
    }
  }

  function hideSetupCards() {
    $('#setup-offline').classList.add('hidden');
    $('#setup-model').classList.add('hidden');
    $('#setup-ready').classList.add('hidden');
  }

  function scheduleRetry() {
    if (statusRetryTimer) return;
    statusRetryTimer = setInterval(() => checkOllamaStatus(), 5000);
  }

  // ---- Copy Command Button -----------------------------------------------

  const btnCopyCmd = $('#btn-copy-cmd');
  if (btnCopyCmd) {
    btnCopyCmd.addEventListener('click', async () => {
      const text = $('#pull-command').textContent;
      try {
        await navigator.clipboard.writeText(text);
        btnCopyCmd.title = 'Copied!';
        setTimeout(() => { btnCopyCmd.title = 'Copy to clipboard'; }, 2000);
      } catch {
        // Fallback: select the text
        const range = document.createRange();
        range.selectNodeContents($('#pull-command'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  // ---- Keyword Extraction ------------------------------------------------

  function extractKeywords() {
    return new Promise((resolve) => {
      chrome.storage.local.get('imdb_lists', (data) => {
        const lists = Array.isArray(data.imdb_lists) ? data.imdb_lists : [];
        const counts = new Map();

        for (const list of lists) {
          if (!list || !Array.isArray(list.movies)) continue;
          for (const movie of list.movies) {
            if (!movie || !Array.isArray(movie.keywords)) continue;
            for (const kw of movie.keywords) {
              const clean = String(kw).trim().toLowerCase();
              if (!clean) continue;
              counts.set(clean, (counts.get(clean) || 0) + 1);
            }
          }
        }

        // Filter by minimum occurrences
        const filtered = new Map();
        for (const [kw, count] of counts) {
          if (count >= MIN_KEYWORD_OCCURRENCES) {
            filtered.set(kw, count);
          }
        }

        resolve(filtered);
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

  async function deleteObsoleteEmbeddings(validKeywords) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        for (const key of req.result) {
          if (!validKeywords.has(key)) {
            store.delete(key);
          }
        }
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // ---- Ollama Embedding Client -------------------------------------------

  async function fetchEmbeddingsBatch(keywords) {
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'OLLAMA_EMBED', model: MODEL_NAME, input: keywords },
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
    const keywordCounts = await extractKeywords();
    state.keywordCounts = keywordCounts;

    if (keywordCounts.size === 0) {
      showStage('#stage-empty');
      return;
    }

    statusEl.textContent = `Found ${keywordCounts.size} keywords. Loading cache…`;
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
    for (const kw of currentKeys) {
      if (!cached.has(kw)) newKeywords.push(kw);
    }

    // 4. Delete obsolete
    statusEl.textContent = 'Cleaning obsolete embeddings…';
    barEl.style.width = '15%';
    try {
      await deleteObsoleteEmbeddings(currentKeys);
    } catch { /* non-critical */ }

    // Remove obsolete from local cache map
    for (const kw of cached.keys()) {
      if (!currentKeys.has(kw)) cached.delete(kw);
    }

    // 5. Fetch new embeddings in batches
    if (newKeywords.length > 0) {
      statusEl.textContent = `Fetching embeddings for ${newKeywords.length} new keywords…`;
      const totalBatches = Math.ceil(newKeywords.length / BATCH_SIZE);
      let completedBatches = 0;

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
          statusEl.textContent = `Error fetching embeddings: ${err.message}`;
          statsEl.textContent = 'Will retry on next sync.';
          // Continue with what we have
          break;
        }

        completedBatches++;
        const pct = 15 + Math.round((completedBatches / totalBatches) * 75);
        barEl.style.width = `${pct}%`;
        statsEl.textContent = `${Math.min((i + BATCH_SIZE), newKeywords.length)} / ${newKeywords.length} keywords embedded`;
      }
    } else {
      statusEl.textContent = 'All embeddings are up to date.';
    }

    barEl.style.width = '95%';
    statusEl.textContent = 'Clustering keywords…';

    // 6. Store and cluster
    state.embeddings = cached;
    const clusters = runDBSCAN(cached, state.keywordCounts);
    state.clusters = clusters;

    barEl.style.width = '100%';
    statusEl.textContent = `Created ${clusters.length} clusters from ${cached.size} keywords.`;
    statsEl.textContent = '';

    // 7. Switch to cluster view
    setTimeout(() => {
      renderClusterView();
      showStage('#stage-clusters');
    }, 600);
  }

  // ---- DBSCAN Clustering -------------------------------------------------

  function cosineSimilarity(a, b) {
    // Vectors from Ollama are L2-normalized, so dot product = cosine sim.
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  function runDBSCAN(embeddings, keywordCounts) {
    const keywords = Array.from(embeddings.keys());
    const n = keywords.length;
    if (n === 0) return [];

    // Pre-compute a similarity matrix for small-to-medium sets.
    // For very large sets (>5000), we'd want a KD-tree, but keywords
    // rarely exceed a few thousand.
    const vectors = keywords.map((kw) => embeddings.get(kw));

    const NOISE = -1;
    const UNVISITED = -2;
    const labels = new Array(n).fill(UNVISITED);
    let clusterId = 0;

    function regionQuery(idx) {
      const neighbors = [];
      const vec = vectors[idx];
      for (let j = 0; j < n; j++) {
        if (j === idx) continue;
        const dist = 1 - cosineSimilarity(vec, vectors[j]);
        if (dist <= DBSCAN_EPS) neighbors.push(j);
      }
      return neighbors;
    }

    for (let i = 0; i < n; i++) {
      if (labels[i] !== UNVISITED) continue;

      const neighbors = regionQuery(i);
      if (neighbors.length < DBSCAN_MIN_PTS) {
        labels[i] = NOISE;
        continue;
      }

      labels[i] = clusterId;
      const seed = [...neighbors];

      for (let s = 0; s < seed.length; s++) {
        const j = seed[s];
        if (labels[j] === NOISE) labels[j] = clusterId;
        if (labels[j] !== UNVISITED) continue;

        labels[j] = clusterId;
        const jNeighbors = regionQuery(j);
        if (jNeighbors.length >= DBSCAN_MIN_PTS) {
          for (const k of jNeighbors) {
            if (!seed.includes(k)) seed.push(k);
          }
        }
      }

      clusterId++;
    }

    // Group keywords by cluster
    const clusterMap = new Map();
    const noiseKeywords = [];

    for (let i = 0; i < n; i++) {
      if (labels[i] === NOISE) {
        noiseKeywords.push(keywords[i]);
      } else {
        const cid = labels[i];
        if (!clusterMap.has(cid)) clusterMap.set(cid, []);
        clusterMap.get(cid).push(keywords[i]);
      }
    }

    // Build cluster objects with auto-labels
    const clusters = [];
    for (const [, members] of clusterMap) {
      // Sort members by count descending
      members.sort((a, b) => (keywordCounts.get(b) || 0) - (keywordCounts.get(a) || 0));

      // Auto-label: pick the most frequent keyword, prefer shorter labels
      let label = members[0];
      const topCount = keywordCounts.get(members[0]) || 0;
      for (const m of members) {
        const count = keywordCounts.get(m) || 0;
        if (count === topCount && m.length < label.length) label = m;
        if (count < topCount) break;
      }

      clusters.push({ label, keywords: members });
    }

    // Sort clusters by size descending
    clusters.sort((a, b) => b.keywords.length - a.keywords.length);

    // Add noise cluster at the end if any
    if (noiseKeywords.length > 0) {
      noiseKeywords.sort((a, b) => (keywordCounts.get(b) || 0) - (keywordCounts.get(a) || 0));
      clusters.push({ label: 'Other', keywords: noiseKeywords, isNoise: true });
    }

    return clusters;
  }

  // ---- Cluster UI Rendering ----------------------------------------------

  function renderClusterView() {
    renderClusters();
    updateSelectionCount();
    bindClusterControls();
  }

  function renderClusters() {
    const body = $('#clusters-body');
    body.innerHTML = '';

    const search = state.searchTerm.toLowerCase();

    for (let ci = 0; ci < state.clusters.length; ci++) {
      const cluster = state.clusters[ci];
      const card = document.createElement('div');
      card.className = cluster.isNoise ? 'cluster-card noise-cluster' : 'cluster-card';

      const accentClass = ACCENT_CLASSES[ci % ACCENT_CLASSES.length];

      // Check if any keywords in this cluster match search
      const hasSearchMatch = search
        ? cluster.keywords.some((kw) => kw.includes(search))
        : true;

      if (search && !hasSearchMatch) {
        card.style.display = 'none';
      }

      card.innerHTML = `
        <div class="cluster-head">
          <div class="cluster-accent ${accentClass}"></div>
          <span class="cluster-label">${escapeHtml(cluster.label)}</span>
          <span class="cluster-count">${cluster.keywords.length} keyword${cluster.keywords.length === 1 ? '' : 's'}</span>
        </div>
        <div class="pill-row"></div>
      `;

      const pillRow = card.querySelector('.pill-row');

      for (const kw of cluster.keywords) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill';
        btn.dataset.keyword = kw;

        const count = state.keywordCounts.get(kw) || 0;
        btn.innerHTML = `${escapeHtml(kw)}<span class="pill-count">${count}</span>`;
        btn.setAttribute('aria-pressed', String(state.selectedKeywords.has(kw)));

        // Search highlighting
        if (search) {
          if (kw.includes(search)) {
            btn.classList.add('search-match');
          } else {
            btn.classList.add('search-dim');
          }
        }

        btn.addEventListener('click', () => {
          toggleKeyword(kw);
          btn.setAttribute('aria-pressed', String(state.selectedKeywords.has(kw)));
          updateSelectionCount();
        });

        pillRow.appendChild(btn);
      }

      body.appendChild(card);
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
    $('#selection-count').textContent = `${count} keyword${count === 1 ? '' : 's'} selected`;
    $('#btn-start-immersive').disabled = count === 0;
  }

  function bindClusterControls() {
    // Search
    const searchInput = $('#search-input');
    searchInput.addEventListener('input', () => {
      state.searchTerm = searchInput.value.trim();
      renderClusters();
    });

    // Clear selection
    $('#btn-clear-selection').addEventListener('click', () => {
      state.selectedKeywords.clear();
      renderClusters();
      updateSelectionCount();
    });

    // Re-sync
    $('#btn-resync').addEventListener('click', () => {
      state.selectedKeywords.clear();
      state.embeddings.clear();
      state.clusters = [];
      checkOllamaStatus();
      showStage('#stage-status');
    });

    // Start Immersive Playback
    $('#btn-start-immersive').addEventListener('click', async () => {
      if (state.selectedKeywords.size === 0) return;

      const keywords = Array.from(state.selectedKeywords);

      // Store selected keywords in session storage for the immersive page to pick up
      try {
        await chrome.storage.session.set({ ai_cluster_keywords: keywords });
      } catch {
        // Session storage unavailable — fall back to local storage with a cleanup flag
        await new Promise((resolve) => {
          chrome.storage.local.set({ ai_cluster_keywords: keywords }, resolve);
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

      // Open immersive with AI keywords flag
      const url = chrome.runtime.getURL(
        `src/immersive/immersive.html?scope=all&aiKeywords=1`
      );
      chrome.tabs.create({ url });
    });
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

  showStage('#stage-status');
  checkOllamaStatus();

})();
