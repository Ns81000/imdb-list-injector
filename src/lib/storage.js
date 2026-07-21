// src/lib/storage.js

(function (root) {
  const DEFAULT_MODE = 'watching';
  const VALID_MODES = ['watching', 'watched'];

  function normalizeMode(mode) {
    if (VALID_MODES.includes(mode)) return mode;
    return DEFAULT_MODE;
  }

  function getActiveMode() {
    return new Promise((resolve) => {
      chrome.storage.local.get('imdb_active_mode', (data) => {
        if (chrome.runtime.lastError) {
          resolve(DEFAULT_MODE);
        } else {
          resolve(normalizeMode(data ? data.imdb_active_mode : null));
        }
      });
    });
  }

  function setActiveMode(mode) {
    const valid = normalizeMode(mode);
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ imdb_active_mode: valid }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(valid);
      });
    });
  }

  function getStorageKey(baseKey, mode) {
    if (['imdb_lists', 'imdb_prefs', 'ai_cluster_order', 'ai_cluster_movies'].includes(baseKey)) {
      const activeMode = normalizeMode(mode);
      return `${baseKey}_${activeMode}`;
    }
    return baseKey;
  }

  async function migrateLegacyDataIfNeeded() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['imdb_lists', 'imdb_lists_watching', 'imdb_prefs', 'imdb_prefs_watching'], (data) => {
        if (chrome.runtime.lastError) return resolve();
        const updates = {};
        if (data.imdb_lists && !data.imdb_lists_watching) {
          updates.imdb_lists_watching = data.imdb_lists;
        }
        if (data.imdb_prefs && !data.imdb_prefs_watching) {
          updates.imdb_prefs_watching = data.imdb_prefs;
        }
        if (Object.keys(updates).length > 0) {
          chrome.storage.local.set(updates, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }

  const StorageHelper = {
    DEFAULT_MODE,
    VALID_MODES,
    normalizeMode,
    getActiveMode,
    setActiveMode,
    getStorageKey,
    migrateLegacyDataIfNeeded
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageHelper;
  } else {
    root.StorageHelper = StorageHelper;
  }
})(typeof self !== 'undefined' ? self : this);
