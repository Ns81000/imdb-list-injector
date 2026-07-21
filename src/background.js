// src/background.js

importScripts('parser.js');
importScripts('credits-parser.js');

// --- Storage Write Lock ---
// Serialises every read-modify-write on chrome.storage so that concurrent
// refreshes, saves, or deletes cannot overwrite each other's changes.
let _storageQueue = Promise.resolve();

function withStorageLock(fn) {
  const next = _storageQueue.then(() => fn());
  // Keep the queue moving even if fn throws, so subsequent callers aren't stuck.
  _storageQueue = next.catch(() => {});
  return next;
}

const DEFAULT_STORAGE_KEY = 'imdb_lists_watching';

function resolveStorageKey(key) {
  if (key === 'imdb_lists_watching' || key === 'imdb_lists_watched') return key;
  return DEFAULT_STORAGE_KEY;
}

function setupSidePanelBehavior() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Ignore unsupported environments.
  });
}

function setupOllamaCorsBypass() {
  if (!chrome.declarativeNetRequest) return;
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Origin", operation: "remove" },
          { header: "Referer", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "http://localhost:11434/*",
        resourceTypes: ["xmlhttprequest"]
      }
    }]
  }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  setupSidePanelBehavior();
  setupOllamaCorsBypass();
});

chrome.runtime.onStartup.addListener(() => {
  setupSidePanelBehavior();
  setupOllamaCorsBypass();
});

setupSidePanelBehavior();
setupOllamaCorsBypass();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_LIST') {
    fetchAndParseList(message.url)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_LISTS') {
    const sk = resolveStorageKey(message.storageKey);
    chrome.storage.local.get(sk, (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ lists: [], error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ lists: data[sk] || [] });
      }
    });
    return true;
  }

  if (message.type === 'SAVE_LIST') {
    saveList(message.listData, resolveStorageKey(message.storageKey))
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'DELETE_LIST') {
    deleteList(message.listId, resolveStorageKey(message.storageKey))
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'REFRESH_LIST') {
    refreshList(message.listId, message.url, resolveStorageKey(message.storageKey))
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'START_KEYWORD_FETCH') {
    startKeywordFetch(message.listId, message.force, resolveStorageKey(message.storageKey))
      .then(status => sendResponse({ success: true, status }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CANCEL_KEYWORD_FETCH') {
    cancelKeywordFetch(message.listId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_KEYWORD_FETCH_STATUS') {
    const status = getKeywordFetchStatus(message.listId);
    sendResponse({ success: true, ...status });
    return true;
  }

  if (message.type === 'START_CREDITS_FETCH') {
    startCreditsFetch(message.listId, message.force, resolveStorageKey(message.storageKey))
      .then(status => sendResponse({ success: true, status }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CANCEL_CREDITS_FETCH') {
    cancelCreditsFetch(message.listId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_CREDITS_FETCH_STATUS') {
    const status = getCreditsFetchStatus(message.listId);
    sendResponse({ success: true, ...status });
    return true;
  }

  // --- Ollama API proxy (bypasses CORS for extension pages) ---

  if (message.type === 'OLLAMA_TAGS') {
    fetch('http://localhost:11434/api/tags', { method: 'GET' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'OLLAMA_EMBED') {
    fetch('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: message.model, input: message.input })
    })
      .then(r => {
        if (!r.ok) return r.text().then(t => { throw new Error(`HTTP ${r.status} ${t}`); });
        return r.json();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function fetchAndParseList(url, attempt = 1) {
  try {
    const firstPage = await fetchAndParseSinglePage(url);
    if (!firstPage.success || firstPage.movies.length === 0) {
      throw new Error('No movies found in list. Check the URL is a public IMDB list.');
    }

    const totalItems = Number(firstPage.totalItems) || firstPage.movies.length;
    let allMovies = [...firstPage.movies];

    // IMDb list pages currently return up to 250 items per page.
    if (totalItems > allMovies.length) {
      const totalPages = Math.ceil(totalItems / 250);
      for (let page = 2; page <= totalPages; page++) {
        const pageUrl = withPageParam(url, page);
        const pageResult = await fetchAndParseSinglePage(pageUrl);
        if (!pageResult.success || !Array.isArray(pageResult.movies) || pageResult.movies.length === 0) {
          break;
        }
        allMovies = mergeMovies(allMovies, pageResult.movies);
        if (allMovies.length >= totalItems) {
          break;
        }
      }
    }

    allMovies.sort((a, b) => {
      const ap = Number(a.position);
      const bp = Number(b.position);
      const aNum = Number.isFinite(ap) ? ap : Number.MAX_SAFE_INTEGER;
      const bNum = Number.isFinite(bp) ? bp : Number.MAX_SAFE_INTEGER;
      return aNum - bNum;
    });

    return {
      ...firstPage,
      movies: allMovies,
      totalItems: Math.max(totalItems, allMovies.length)
    };
  } catch (err) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1500));
      return fetchAndParseList(url, attempt + 1);
    }
    throw err;
  }
}

// IMDb list URLs are only reachable at https://www.imdb.com — that is the sole
// host in both the CSP connect-src and host_permissions (so cookies are sent).
// A user can legitimately paste "http://imdb.com/list/ls123" (the URL validator
// allows a missing "www." and http); canonicalize to the one origin we're
// allowed to talk to so the fetch doesn't fail with an opaque CSP/permission
// error. The stored id derives from the ls-number, so it is unaffected.
function canonicalizeImdbUrl(url) {
  try {
    const u = new URL(String(url));
    if (/(^|\.)imdb\.com$/i.test(u.hostname)) {
      u.protocol = 'https:';
      u.hostname = 'www.imdb.com';
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchAndParseSinglePage(url, timeoutMs = 20000) {
  url = canonicalizeImdbUrl(url);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Send the browser's imdb.com cookies so the request is treated like a
      // real logged-in visit. Without this IMDb's bot protection (AWS WAF)
      // serves a challenge page instead of the list. Note: User-Agent is a
      // forbidden fetch header and is silently dropped by Chrome, so it is not
      // set here — Chrome supplies its real browser User-Agent automatically.
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    if (!html || html.length === 0) {
      throw new Error('Empty response');
    }
    if (isBotChallenge(html)) {
      throw new Error('IMDb returned a bot-check page. Open imdb.com in a browser tab, make sure you can view the list there, then try again.');
    }
    return parseIMDBList(html);
  } finally {
    clearTimeout(timeoutId);
  }
}

// IMDb (AWS WAF) sometimes returns a tiny JavaScript "verify you're not a robot"
// page with HTTP 200. It has no list data, so detect it and surface an accurate
// error instead of the misleading "No movies found".
function isBotChallenge(html) {
  if (html.length > 20000) return false; // real list pages are far larger
  return /awswaf|challenge-container|AwsWafIntegration|Enable JavaScript/i.test(html);
}

function withPageParam(url, page) {
  const parsed = new URL(url);
  parsed.searchParams.set('page', String(page));
  return parsed.toString();
}

function mergeMovies(existing, incoming) {
  if (!Array.isArray(existing)) existing = [];
  if (!Array.isArray(incoming)) incoming = [];
  
  const seen = new Set(existing.map(m => `${m.imdb_id}|${m.position}`));
  const merged = [...existing];

  for (const movie of incoming) {
    if (!movie || typeof movie !== 'object') continue;
    const key = `${movie.imdb_id}|${movie.position}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(movie);
    if (merged.length > 10000) break;
  }

  return merged;
}

async function saveList(listData, storageKey = DEFAULT_STORAGE_KEY) {
  if (!listData || typeof listData !== 'object') {
    throw new Error('Invalid list data');
  }
  return withStorageLock(async () => {
    const stored = await getStoredLists(storageKey);
    if (stored.length >= 10000 && !stored.some(l => l.id === listData.id)) {
      throw new Error('Maximum lists reached (10000)');
    }
    const existing = stored.findIndex(l => l && l.id === listData.id);
    if (existing >= 0) {
      stored[existing] = listData;
    } else {
      stored.push(listData);
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [storageKey]: stored }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  });
}

async function deleteList(listId, storageKey = DEFAULT_STORAGE_KEY) {
  cancelKeywordFetch(listId);
  cancelCreditsFetch(listId);
  return withStorageLock(async () => {
    const stored = await getStoredLists(storageKey);
    const updated = stored.filter(l => l.id !== listId);
    return chrome.storage.local.set({ [storageKey]: updated });
  });
}

async function refreshList(listId, url, storageKey = DEFAULT_STORAGE_KEY) {
  cancelKeywordFetch(listId);
  cancelCreditsFetch(listId);
  // Network fetch runs concurrently — only the storage write step is locked.
  const result = await fetchAndParseList(url);
  await withStorageLock(async () => {
    const stored = await getStoredLists(storageKey);
    const idx = stored.findIndex(l => l.id === listId);
    if (idx >= 0) {
      // Map old keywords and credits by imdb_id
      const oldKeywordsMap = new Map();
      const oldCreditsMap = new Map();
      if (Array.isArray(stored[idx].movies)) {
        for (const m of stored[idx].movies) {
          if (m && m.imdb_id) {
            if (Array.isArray(m.keywords)) {
              oldKeywordsMap.set(m.imdb_id, m.keywords);
            }
            if (m.credits && typeof m.credits === 'object') {
              oldCreditsMap.set(m.imdb_id, m.credits);
            }
          }
        }
      }
      // Merge keywords and credits into new movies list
      for (const m of result.movies) {
        if (m && m.imdb_id) {
          if (oldKeywordsMap.has(m.imdb_id)) {
            m.keywords = oldKeywordsMap.get(m.imdb_id);
          }
          if (oldCreditsMap.has(m.imdb_id)) {
            m.credits = oldCreditsMap.get(m.imdb_id);
          }
        }
      }
      stored[idx].movies = result.movies;
      stored[idx].lastRefreshed = new Date().toISOString();
      stored[idx].movieCount = result.movies.length;
      // Pick up a renamed list, but never clobber a good name with a blank one.
      if (result.listName) stored[idx].name = String(result.listName).slice(0, 500);
      await chrome.storage.local.set({ [storageKey]: stored });
    }
  });
  return result;
}

function getStoredLists(storageKey = DEFAULT_STORAGE_KEY) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(storageKey, data => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const lists = data[storageKey] || [];
        resolve(Array.isArray(lists) ? lists : []);
      }
    });
  });
}

// --- Keywords Scraping Queue Manager ---
const activeKeywordQueues = new Map();

function getKeywordFetchStatus(listId) {
  const queue = activeKeywordQueues.get(listId);
  if (!queue) return { status: 'idle' };
  return {
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount,
    errorMsg: queue.errorMsg,
    lastFetchedTitle: queue.lastFetchedTitle
  };
}

function broadcastProgress(queue) {
  chrome.runtime.sendMessage({
    type: 'KEYWORD_FETCH_PROGRESS',
    listId: queue.listId,
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount,
    errorMsg: queue.errorMsg,
    lastFetchedTitle: queue.lastFetchedTitle
  }).catch(() => {
    // Ignore error if popup is closed and no listener exists
  });
}

async function saveBatchProgress(listId, batch, storageKey = DEFAULT_STORAGE_KEY) {
  if (batch.length === 0) return;
  const batchMap = new Map(batch.map(item => [item.imdb_id, item.keywords]));
  await withStorageLock(async () => {
    const stored = await getStoredLists(storageKey);
    const list = stored.find(l => l.id === listId);
    if (list && Array.isArray(list.movies)) {
      for (const m of list.movies) {
        if (batchMap.has(m.imdb_id)) {
          m.keywords = batchMap.get(m.imdb_id);
        }
      }
      await chrome.storage.local.set({ [storageKey]: stored });
    }
  });
}

function cancelKeywordFetch(listId) {
  const queue = activeKeywordQueues.get(listId);
  if (queue) {
    queue.status = 'cancelled';
    queue.abortController.abort();
    // Save any pending progress
    saveBatchProgress(listId, queue.saveBuffer, queue.storageKey).catch(() => {});
    broadcastProgress(queue);
    activeKeywordQueues.delete(listId);
  }
}

async function startKeywordFetch(listId, force = false, storageKey = DEFAULT_STORAGE_KEY) {
  if (activeKeywordQueues.has(listId)) {
    return getKeywordFetchStatus(listId);
  }

  const stored = await getStoredLists(storageKey);
  const list = stored.find(l => l.id === listId);
  if (!list) {
    throw new Error('List not found');
  }

  let moviesToFetch = [];
  if (force) {
    await withStorageLock(async () => {
      const latestStored = await getStoredLists(storageKey);
      const latestList = latestStored.find(l => l.id === listId);
      if (latestList && Array.isArray(latestList.movies)) {
        for (const m of latestList.movies) {
          delete m.keywords;
        }
        await chrome.storage.local.set({ [storageKey]: latestStored });
      }
    });
    // Re-read after clearing to get the authoritative movie list
    const freshStored = await getStoredLists(storageKey);
    const freshList = freshStored.find(l => l.id === listId);
    moviesToFetch = (freshList && Array.isArray(freshList.movies)) ? [...freshList.movies] : [];
  } else {
    moviesToFetch = (Array.isArray(list.movies) ? list.movies : []).filter(
      m => !m.keywords || !Array.isArray(m.keywords)
    );
  }

  if (moviesToFetch.length === 0) {
    return { status: 'complete', fetchedCount: 0, totalCount: 0 };
  }

  const abortController = new AbortController();
  const queue = {
    listId,
    storageKey,
    moviesToFetch: [...moviesToFetch],
    fetchedCount: 0,
    totalCount: moviesToFetch.length,
    abortController,
    status: 'running',
    errorMsg: '',
    lastFetchedTitle: '',
    saveBuffer: []
  };

  activeKeywordQueues.set(listId, queue);

  // Start processing loop asynchronously
  (async () => {
    try {
      while (queue.status === 'running' && queue.moviesToFetch.length > 0) {
        const movie = queue.moviesToFetch[0];
        queue.lastFetchedTitle = movie.title || '';
        broadcastProgress(queue);

        let keywords = [];
        try {
          keywords = await fetchKeywordsForTitle(movie.imdb_id, queue.abortController.signal);
        } catch (err) {
          if (queue.abortController.signal.aborted) {
            break;
          }
          queue.status = 'error';
          queue.errorMsg = err.message || 'Error fetching keywords';
          broadcastProgress(queue);
          break;
        }

        movie.keywords = keywords;
        queue.saveBuffer.push({ imdb_id: movie.imdb_id, keywords });
        queue.moviesToFetch.shift();
        queue.fetchedCount++;

        // Periodic batch save
        if (queue.saveBuffer.length >= 10 || queue.moviesToFetch.length === 0) {
          await saveBatchProgress(listId, queue.saveBuffer, storageKey);
          queue.saveBuffer = [];
        }

        if (queue.moviesToFetch.length === 0) {
          queue.status = 'complete';
          broadcastProgress(queue);
          activeKeywordQueues.delete(listId);
          break;
        }

        // Delay between fetches: random between 800ms and 1500ms
        const delay = 800 + Math.random() * 700;
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, delay);
          queue.abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }).catch(() => {});

        if (queue.abortController.signal.aborted) {
          break;
        }
      }
    } catch (loopErr) {
      queue.status = 'error';
      queue.errorMsg = loopErr.message || 'Loop error';
      broadcastProgress(queue);
    }
  })();

  return {
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount
  };
}

async function fetchKeywordsForTitle(imdbId, signal) {
  const url = `https://www.imdb.com/title/${imdbId}/keywords/`;
  const response = await fetch(url, {
    signal,
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('IMDb verification check triggered. Open imdb.com in a new browser tab, verify you are not a robot, and try again.');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html || html.length === 0) {
    throw new Error('Empty response from IMDb');
  }
  if (isBotChallenge(html)) {
    throw new Error('IMDb returned a bot-check page. Open imdb.com in a browser tab, verify you are not a robot, then try again.');
  }

  return parseIMDBKeywords(html);
}

// --- Credits Scraping Queue Manager ---
const activeCreditsQueues = new Map();

function getCreditsFetchStatus(listId) {
  const queue = activeCreditsQueues.get(listId);
  if (!queue) return { status: 'idle' };
  return {
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount,
    errorMsg: queue.errorMsg,
    lastFetchedTitle: queue.lastFetchedTitle
  };
}

function broadcastCreditsProgress(queue) {
  chrome.runtime.sendMessage({
    type: 'CREDITS_FETCH_PROGRESS',
    listId: queue.listId,
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount,
    errorMsg: queue.errorMsg,
    lastFetchedTitle: queue.lastFetchedTitle
  }).catch(() => {});
}

async function saveCreditsBatchProgress(listId, batch, storageKey = DEFAULT_STORAGE_KEY) {
  if (batch.length === 0) return;
  const batchMap = new Map(batch.map(item => [item.imdb_id, item.credits]));
  await withStorageLock(async () => {
    const stored = await getStoredLists(storageKey);
    const list = stored.find(l => l.id === listId);
    if (list && Array.isArray(list.movies)) {
      for (const m of list.movies) {
        if (batchMap.has(m.imdb_id)) {
          m.credits = batchMap.get(m.imdb_id);
        }
      }
      await chrome.storage.local.set({ [storageKey]: stored });
    }
  });
}

function cancelCreditsFetch(listId) {
  const queue = activeCreditsQueues.get(listId);
  if (queue) {
    queue.status = 'cancelled';
    queue.abortController.abort();
    saveCreditsBatchProgress(listId, queue.saveBuffer, queue.storageKey).catch(() => {});
    broadcastCreditsProgress(queue);
    activeCreditsQueues.delete(listId);
  }
}

async function startCreditsFetch(listId, force = false, storageKey = DEFAULT_STORAGE_KEY) {
  if (activeCreditsQueues.has(listId)) {
    return getCreditsFetchStatus(listId);
  }

  const stored = await getStoredLists(storageKey);
  const list = stored.find(l => l.id === listId);
  if (!list) {
    throw new Error('List not found');
  }

  let moviesToFetch = [];
  if (force) {
    await withStorageLock(async () => {
      const latestStored = await getStoredLists(storageKey);
      const latestList = latestStored.find(l => l.id === listId);
      if (latestList && Array.isArray(latestList.movies)) {
        for (const m of latestList.movies) {
          delete m.credits;
        }
        await chrome.storage.local.set({ [storageKey]: latestStored });
      }
    });
    const freshStored = await getStoredLists(storageKey);
    const freshList = freshStored.find(l => l.id === listId);
    moviesToFetch = (freshList && Array.isArray(freshList.movies)) ? [...freshList.movies] : [];
  } else {
    moviesToFetch = (Array.isArray(list.movies) ? list.movies : []).filter(
      m => !m.credits || typeof m.credits !== 'object'
    );
  }

  if (moviesToFetch.length === 0) {
    return { status: 'complete', fetchedCount: 0, totalCount: 0 };
  }

  const abortController = new AbortController();
  const queue = {
    listId,
    storageKey,
    moviesToFetch: [...moviesToFetch],
    fetchedCount: 0,
    totalCount: moviesToFetch.length,
    abortController,
    status: 'running',
    errorMsg: '',
    lastFetchedTitle: '',
    saveBuffer: []
  };

  activeCreditsQueues.set(listId, queue);

  (async () => {
    try {
      while (queue.status === 'running' && queue.moviesToFetch.length > 0) {
        const movie = queue.moviesToFetch[0];
        queue.lastFetchedTitle = movie.title || '';
        broadcastCreditsProgress(queue);

        let credits = { Director: [], Writers: [], Producers: [], Cast: [] };
        try {
          credits = await fetchCreditsForTitle(movie.imdb_id, queue.abortController.signal);
        } catch (err) {
          if (queue.abortController.signal.aborted) {
            break;
          }
          queue.status = 'error';
          queue.errorMsg = err.message || 'Error fetching credits';
          broadcastCreditsProgress(queue);
          break;
        }

        movie.credits = credits;
        queue.saveBuffer.push({ imdb_id: movie.imdb_id, credits });
        queue.moviesToFetch.shift();
        queue.fetchedCount++;

        if (queue.saveBuffer.length >= 10 || queue.moviesToFetch.length === 0) {
          await saveCreditsBatchProgress(listId, queue.saveBuffer, storageKey);
          queue.saveBuffer = [];
        }

        if (queue.moviesToFetch.length === 0) {
          queue.status = 'complete';
          broadcastCreditsProgress(queue);
          activeCreditsQueues.delete(listId);
          break;
        }

        const delay = 800 + Math.random() * 700;
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, delay);
          queue.abortController.signal.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }).catch(() => {});

        if (queue.abortController.signal.aborted) {
          break;
        }
      }
    } catch (loopErr) {
      queue.status = 'error';
      queue.errorMsg = loopErr.message || 'Loop error';
      broadcastCreditsProgress(queue);
    }
  })();

  return {
    status: queue.status,
    fetchedCount: queue.fetchedCount,
    totalCount: queue.totalCount
  };
}

async function fetchCreditsForTitle(imdbId, signal) {
  const url = `https://www.imdb.com/title/${imdbId}/fullcredits/`;
  const response = await fetch(url, {
    signal,
    credentials: 'include',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('IMDb verification check triggered. Open imdb.com in a new browser tab, verify you are not a robot, and try again.');
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html || html.length === 0) {
    throw new Error('Empty response from IMDb');
  }
  if (isBotChallenge(html)) {
    throw new Error('IMDb returned a bot-check page. Open imdb.com in a browser tab, verify you are not a robot, then try again.');
  }

  return parseIMDbFullCredits(html);
}
