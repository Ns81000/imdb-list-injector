// src/background.js

importScripts('parser.js');

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

function setupSidePanelBehavior() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Ignore unsupported environments.
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  setupSidePanelBehavior();
});

setupSidePanelBehavior();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_LIST') {
    fetchAndParseList(message.url)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_LISTS') {
    chrome.storage.local.get('imdb_lists', (data) => {
      if (chrome.runtime.lastError) {
        sendResponse({ lists: [], error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ lists: data.imdb_lists || [] });
      }
    });
    return true;
  }

  if (message.type === 'SAVE_LIST') {
    saveList(message.listData)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'DELETE_LIST') {
    deleteList(message.listId)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'REFRESH_LIST') {
    refreshList(message.listId, message.url)
      .then(result => sendResponse({ success: true, data: result }))
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

async function saveList(listData) {
  if (!listData || typeof listData !== 'object') {
    throw new Error('Invalid list data');
  }
  return withStorageLock(async () => {
    const stored = await getStoredLists();
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
      chrome.storage.local.set({ imdb_lists: stored }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  });
}

async function deleteList(listId) {
  return withStorageLock(async () => {
    const stored = await getStoredLists();
    const updated = stored.filter(l => l.id !== listId);
    return chrome.storage.local.set({ imdb_lists: updated });
  });
}

async function refreshList(listId, url) {
  // Network fetch runs concurrently — only the storage write step is locked.
  const result = await fetchAndParseList(url);
  await withStorageLock(async () => {
    const stored = await getStoredLists();
    const idx = stored.findIndex(l => l.id === listId);
    if (idx >= 0) {
      stored[idx].movies = result.movies;
      stored[idx].lastRefreshed = new Date().toISOString();
      stored[idx].movieCount = result.movies.length;
      // Pick up a renamed list, but never clobber a good name with a blank one.
      if (result.listName) stored[idx].name = String(result.listName).slice(0, 500);
      await chrome.storage.local.set({ imdb_lists: stored });
    }
  });
  return result;
}

function getStoredLists() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get('imdb_lists', data => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        const lists = data.imdb_lists || [];
        resolve(Array.isArray(lists) ? lists : []);
      }
    });
  });
}
