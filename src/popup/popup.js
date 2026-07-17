(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let currentPreview = null;
  let currentUrl = '';
  let defaultFormat = 'csv';
  const pendingRequests = new Map();


  // --- Navigation ---

  function navigateTo(view) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');

    if (view === 'home') renderLists();
  }

  $('#btn-add').addEventListener('click', () => {
    resetAddView();
    navigateTo('add');
  });

  $('#btn-prefs').addEventListener('click', () => {
    loadPrefs();
    navigateTo('prefs');
  });

  $('#btn-back-add').addEventListener('click', () => navigateTo('home'));
  $('#btn-back-prefs').addEventListener('click', () => navigateTo('home'));

  // --- Render Lists ---

  function renderLists() {
    chrome.storage.local.get('imdb_lists', (data) => {
      const lists = data.imdb_lists || [];
      const container = $('#lists-container');
      const empty = $('#empty-state');

      if (lists.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      container.innerHTML = lists.map((list, idx) => `
        <div class="list-card" data-idx="${idx}">
          <div class="list-card-top">
            <div class="list-card-info">
              <div class="list-card-name">
                ${escapeHtml(list.name)}
                <span class="list-card-count">${Number(list.movieCount) || 0}</span>
              </div>
              <div class="list-card-meta">${escapeHtml(formatRelativeTime(list.lastRefreshed))}</div>
            </div>
            <div class="list-card-actions">
              <button class="icon-btn refresh-btn" data-id="${escapeHtml(list.id)}" data-url="${escapeHtml(list.url)}" title="Refresh">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 2v5h5"/>
                  <path d="M3.51 10a5.5 5.5 0 1 0 .68-5.97L1 7"/>
                </svg>
              </button>
              <button class="icon-btn delete delete-btn" data-id="${escapeHtml(list.id)}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                  <path d="M4 4l8 8M12 4l-8 8"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="list-card-actions-row">
            <div class="list-card-actions-left">
              <button class="list-action-btn copy-btn" data-idx="${idx}" title="Copy formatted list">Copy</button>
              <button class="list-action-btn download-btn" data-idx="${idx}" title="Download formatted list">Download</button>
              <button class="list-action-btn keywords-btn" data-id="${escapeHtml(list.id)}" data-idx="${idx}" title="Fetch keywords">Keywords</button>
            </div>
            <button class="list-action-btn immersive-btn" data-id="${escapeHtml(list.id)}" title="Immersive mode">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1.5" y="3" width="13" height="10" rx="1.5"/>
                <path d="M6.5 6.2v3.6l3-1.8z" fill="currentColor" stroke="none"/>
              </svg>
              Immersive
            </button>
          </div>
          <div class="keyword-progress-container hidden" id="kw-progress-${escapeHtml(list.id)}">
            <div class="keyword-progress-header">
              <span class="keyword-progress-status" id="kw-status-${escapeHtml(list.id)}">Preparing...</span>
              <span class="keyword-progress-count" id="kw-count-${escapeHtml(list.id)}">0/0</span>
            </div>
            <div class="keyword-progress-bar-bg">
              <div class="keyword-progress-bar" id="kw-bar-${escapeHtml(list.id)}"></div>
            </div>
            <div class="keyword-progress-actions" id="kw-actions-${escapeHtml(list.id)}">
              <button class="kw-action-link cancel" data-id="${escapeHtml(list.id)}">Cancel</button>
              <button class="kw-action-link resume hidden" data-id="${escapeHtml(list.id)}">Resume</button>
            </div>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.refresh-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleRefresh(btn.dataset.id, btn.dataset.url, btn);
        });
      });

      container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleDelete(btn.dataset.id);
        });
      });

      container.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.idx);
          const list = lists[idx];
          if (!list) return;
          if (btn.disabled) return;
          btn.disabled = true;
          try {
            await handleCopy(list);
          } catch (err) {
            showHomeStatus(`Copy failed: ${err.message || 'unknown error'}.`, true);
          } finally {
            btn.disabled = false;
          }
        });
      });

      container.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = Number(btn.dataset.idx);
          const list = lists[idx];
          if (!list) return;
          if (btn.disabled) return;
          btn.disabled = true;
          try {
            await handleDownload(list);
          } catch (err) {
            showHomeStatus(`Download failed: ${err.message || 'unknown error'}.`, true);
          } finally {
            btn.disabled = false;
          }
        });
      });

      container.querySelectorAll('.immersive-btn').forEach(btn => {
        btn.addEventListener('click', () => openImmersive('list', btn.dataset.id));
      });

      container.querySelectorAll('.keywords-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          const list = lists[idx];
          if (!list) return;
          handleKeywordsFetchClick(list);
        });
      });

      container.querySelectorAll('.kw-action-link.cancel').forEach(btn => {
        btn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'CANCEL_KEYWORD_FETCH', listId: btn.dataset.id });
        });
      });

      container.querySelectorAll('.kw-action-link.resume').forEach(btn => {
        btn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'START_KEYWORD_FETCH', listId: btn.dataset.id, force: false });
        });
      });

      // Restore active keyword fetch status on render
      lists.forEach(list => {
        chrome.runtime.sendMessage({ type: 'GET_KEYWORD_FETCH_STATUS', listId: list.id }, (response) => {
          if (response && response.status && response.status !== 'idle') {
            showKeywordProgress(list.id, response.status, response.fetchedCount, response.totalCount, response.errorMsg, response.lastFetchedTitle);
          }
        });
      });
    });
  }

  // Open the immersive player in a new tab. scope='list' needs an id; 'all'
  // pools every saved list. Guarded so a missing key routes the user to prefs.
  function openImmersive(scope, id) {
    chrome.storage.local.get('imdb_tmdb_key', (data) => {
      if (!data || !data.imdb_tmdb_key) {
        loadPrefs();
        navigateTo('prefs');
        showKeyStatus('Add your TMDB API key below to start Immersive mode.', 'error');
        return;
      }
      const params = new URLSearchParams({ scope });
      if (scope === 'list' && id) params.set('id', id);
      const url = chrome.runtime.getURL(`src/immersive/immersive.html?${params.toString()}`);
      chrome.tabs.create({ url });
    });
  }

  const btnImmersiveAll = $('#btn-immersive-all');
  if (btnImmersiveAll) {
    btnImmersiveAll.addEventListener('click', () => {
      chrome.storage.local.get('imdb_lists', (data) => {
        const lists = data.imdb_lists || [];
        if (lists.length === 0) {
          showHomeStatus('No lists saved yet. Add a list first.', true);
          return;
        }
        openImmersive('all');
      });
    });
  }

  const btnAiCluster = $('#btn-ai-cluster');
  if (btnAiCluster) {
    btnAiCluster.addEventListener('click', () => {
      const url = chrome.runtime.getURL('src/embeddings/embeddings.html');
      chrome.tabs.create({ url });
    });
  }

  // --- Add List ---

  function resetAddView() {
    $('#url-input').value = '';
    $('#url-hint').textContent = '';
    $('#url-hint').className = 'url-hint';
    $('#error-msg').classList.add('hidden');
    $('#preview-section').classList.add('hidden');
    setLoading(false);
    currentPreview = null;
    currentUrl = '';
  }

  $('#url-input').addEventListener('input', () => {
    const url = $('#url-input').value.trim();
    const hint = $('#url-hint');

    if (!url) {
      hint.textContent = '';
      hint.className = 'url-hint';
      return;
    }

    if (isValidIMDBListUrl(url)) {
      hint.textContent = 'Valid IMDB list URL';
      hint.className = 'url-hint valid';
    } else {
      hint.textContent = 'Must be: imdb.com/list/ls...';
      hint.className = 'url-hint invalid';
    }
  });

  $('#fetch-btn').addEventListener('click', () => {
    const url = $('#url-input').value.trim();
    $('#error-msg').classList.add('hidden');
    $('#preview-section').classList.add('hidden');

    if (!isValidIMDBListUrl(url)) {
      showError('Please enter a valid IMDB list URL.');
      return;
    }

    if ($('#fetch-btn').disabled) return;

    currentUrl = url;
    setLoading(true);
    $('#fetch-btn').disabled = true;

    const timeoutId = setTimeout(() => {
      setLoading(false);
      $('#fetch-btn').disabled = false;
      showError('Request timeout. Please try again.');
    }, 30000);

    chrome.runtime.sendMessage({ type: 'FETCH_LIST', url }, (response) => {
      clearTimeout(timeoutId);
      setLoading(false);
      $('#fetch-btn').disabled = false;

      if (chrome.runtime.lastError) {
        showError(`Extension error: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (response && response.success && response.data && response.data.movies) {
        currentPreview = response.data;
        showPreview(response.data);

        const listData = {
          id: generateId(currentUrl),
          name: String(currentPreview.listName || 'Untitled List').slice(0, 500),
          url: currentUrl,
          movies: Array.isArray(currentPreview.movies) ? currentPreview.movies.slice(0, 10000) : [],
          movieCount: currentPreview.movies.length,
          lastRefreshed: new Date().toISOString(),
          thumbnail: null
        };

        if (listData.movies.length === 0) {
          showError('Cannot save list with no movies.');
          return;
        }

        setLoading(true);
        $('#fetch-btn').disabled = true;

        chrome.runtime.sendMessage({ type: 'SAVE_LIST', listData }, (saveResponse) => {
          setLoading(false);
          $('#fetch-btn').disabled = false;

          if (chrome.runtime.lastError) {
            showError(`Save failed: ${chrome.runtime.lastError.message}`);
            return;
          }
          if (!saveResponse || !saveResponse.success) {
            showError(`Save failed: ${saveResponse?.error || 'unknown error'}`);
            return;
          }
          navigateTo('home');
        });
      } else {
        showError((response && response.error) || 'Failed to fetch list. Please try again.');
      }
    });
  });

  // --- Delete & Refresh ---

  function handleDelete(listId) {
    if (!confirm('Are you sure you want to delete this list?')) return;
    chrome.runtime.sendMessage({ type: 'DELETE_LIST', listId }, (response) => {
      if (chrome.runtime.lastError) {
        showHomeStatus(`Delete failed: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      if (!response || !response.success) {
        showHomeStatus(`Delete failed: ${response?.error || 'unknown error'}`, true);
        return;
      }
      renderLists();
    });
  }

  function handleRefresh(listId, url, btnEl) {
    if (pendingRequests.has(listId)) return;

    pendingRequests.set(listId, true);
    btnEl.style.opacity = '0.4';
    btnEl.style.pointerEvents = 'none';

    const svg = btnEl.querySelector('svg');
    if (svg) svg.style.animation = 'spin 0.6s linear infinite';

    chrome.runtime.sendMessage({ type: 'REFRESH_LIST', listId, url }, (response) => {
      pendingRequests.delete(listId);
      btnEl.style.opacity = '';
      btnEl.style.pointerEvents = '';
      if (svg) svg.style.animation = '';

      if (chrome.runtime.lastError) {
        showHomeStatus(`Refresh failed: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      if (response && response.success) {
        renderLists();
        showHomeStatus('List refreshed successfully.');
      } else {
        showHomeStatus(`Refresh failed: ${response?.error || 'unknown error'}`, true);
      }
    });
  }

  // --- Export / Import ---

  $('#btn-export').addEventListener('click', async () => {
    try {
      const data = await new Promise(resolve => {
        chrome.storage.local.get('imdb_lists', resolve);
      });
      const lists = Array.isArray(data?.imdb_lists) ? data.imdb_lists : [];
      const blob = new Blob([JSON.stringify(lists, null, 2)], { type: 'application/json' });
      const filename = `imdb-lists-backup-${Date.now()}.json`;
      await startDownloadFast(blob, filename);
      showHomeStatus(`Exported backup with ${lists.length} list${lists.length === 1 ? '' : 's'}.`);
    } catch (err) {
      showHomeStatus(`Export failed: ${err.message || 'unknown error'}.`, true);
    }
  });

  $('#btn-import').addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (e) => {
      try {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
          throw new Error('File too large (max 50MB)');
        }
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('Backup must be a JSON array');
        if (parsed.length === 0) throw new Error('Backup is empty');
        if (parsed.length > 10000) throw new Error('Too many lists (max 10000)');

        // Never trust the file: sanitize every field before it is stored or
        // rendered. Drops entries that cannot be salvaged into a valid list.
        const imported = parsed
          .map(sanitizeImportedList)
          .filter(Boolean);

        if (imported.length === 0) {
          throw new Error('No valid lists found in backup');
        }

        // Import restores (replaces) the whole library. Confirm before wiping an
        // existing library so a mis-clicked import can't silently destroy data.
        const existing = await new Promise((resolve) => {
          chrome.storage.local.get('imdb_lists', (d) => resolve(Array.isArray(d?.imdb_lists) ? d.imdb_lists : []));
        });
        if (existing.length > 0 &&
            !confirm(`This will replace your current ${existing.length} list${existing.length === 1 ? '' : 's'} with ${imported.length} from the backup. Continue?`)) {
          return;
        }

        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ imdb_lists: imported }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });

        renderLists();
        const skipped = parsed.length - imported.length;
        const skipNote = skipped > 0 ? ` (${skipped} invalid skipped)` : '';
        showHomeStatus(`Imported ${imported.length} list${imported.length === 1 ? '' : 's'} from backup${skipNote}.`);
      } catch (err) {
        showHomeStatus(`Import failed: ${err.message || 'invalid backup file'}.`, true);
      } finally {
        input.remove();
      }
    }, { once: true });

    input.click();
  });

  // --- Preferences ---

  function loadPrefs() {
    chrome.storage.local.get('imdb_prefs', (data) => {
      const prefs = data.imdb_prefs || {};
      defaultFormat = prefs.defaultFormat || 'csv';
      $('#pref-format').value = defaultFormat;
    });
    refreshKeyState();
  }

  function savePrefs() {
    const format = $('#pref-format').value;
    const allowed = new Set(['csv', 'json', 'plain', 'markdown']);
    if (!allowed.has(format)) {
      showHomeStatus('Invalid format selection.', true);
      return;
    }
    const prefs = { defaultFormat: format };
    defaultFormat = prefs.defaultFormat;
    chrome.storage.local.set({ imdb_prefs: prefs }, () => {
      if (chrome.runtime.lastError) {
        showHomeStatus(`Save failed: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      showHomeStatus(`Default format saved: ${formatLabel(prefs.defaultFormat)}.`);
    });
  }

  $('#pref-format').addEventListener('change', savePrefs);

  // --- TMDB key (encrypted at rest) ---

  let keyStatusTimer = null;
  function showKeyStatus(message, kind) {
    const el = $('#key-status');
    if (!el) return;
    el.textContent = String(message || '').slice(0, 200);
    el.classList.remove('hidden', 'error', 'ok');
    if (kind === 'error') el.classList.add('error');
    else if (kind === 'ok') el.classList.add('ok');
    clearTimeout(keyStatusTimer);
    // Persistent for guidance ('error'), transient for success confirmations.
    if (kind === 'ok') {
      keyStatusTimer = setTimeout(() => { el.classList.add('hidden'); keyStatusTimer = null; }, 4000);
    }
  }

  function refreshKeyState() {
    chrome.storage.local.get('imdb_tmdb_key', (data) => {
      const has = !!(data && data.imdb_tmdb_key);
      const clearBtn = $('#btn-clear-key');
      if (clearBtn) clearBtn.disabled = !has;
      if (has) showKeyStatus('A TMDB key is saved and encrypted on this device.', 'ok');
    });
  }

  const btnSaveKey = $('#btn-save-key');
  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', async () => {
      const key = $('#tmdb-key-input').value.trim();
      const pass = $('#tmdb-pass-input').value;
      if (!key) { showKeyStatus('Enter your TMDB API key.', 'error'); return; }
      if (!pass || pass.length < 4) { showKeyStatus('Choose a passphrase of at least 4 characters.', 'error'); return; }
      if (!globalThis.ImmersiveCrypto || !globalThis.ImmersiveTmdb) { showKeyStatus('Internal error: crypto unavailable.', 'error'); return; }

      btnSaveKey.disabled = true;
      const original = btnSaveKey.textContent;
      btnSaveKey.textContent = 'Verifying…';
      try {
        const valid = await globalThis.ImmersiveTmdb.validateKey(key);
        if (!valid) {
          showKeyStatus('That key was rejected by TMDB. Check it and try again.', 'error');
          return;
        }
        const record = await globalThis.ImmersiveCrypto.encrypt(key, pass);
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ imdb_tmdb_key: record }, () => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve();
          });
        });
        // Prime the in-memory (session) copy so the first launch skips the prompt.
        try { await chrome.storage.session.set({ imdb_tmdb_key_plain: key }); } catch { /* session unavailable */ }
        $('#tmdb-key-input').value = '';
        $('#tmdb-pass-input').value = '';
        showKeyStatus('Key verified and encrypted. Immersive mode is ready.', 'ok');
        refreshKeyState();
      } catch (err) {
        showKeyStatus(`Could not save key: ${err.message || 'unknown error'}.`, 'error');
      } finally {
        btnSaveKey.disabled = false;
        btnSaveKey.textContent = original;
      }
    });
  }

  const btnClearKey = $('#btn-clear-key');
  if (btnClearKey) {
    btnClearKey.addEventListener('click', async () => {
      if (!confirm('Remove the saved TMDB key from this device?')) return;
      await new Promise((resolve) => chrome.storage.local.remove('imdb_tmdb_key', resolve));
      try { await chrome.storage.session.remove('imdb_tmdb_key_plain'); } catch { /* noop */ }
      $('#btn-clear-key').disabled = true;
      showKeyStatus('TMDB key removed.', 'ok');
    });
  }

  // --- Field coercion (safety net for older saved lists) ---
  // Lists saved before the parser fix may hold a description (or other field)
  // as an IMDb rich-text OBJECT instead of a string. Coerce every field to a
  // clean string here so exports never emit "[object Object]" — no re-fetch
  // required.
  const decodeEntities = (s) =>
    String(s)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&(?:apos|#0*39);/gi, "'")
      .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ''; } })
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return ''; } });

  // Clean an HTML/markdown string: drop tags, decode entities, collapse space.
  const cleanHtml = (s) =>
    decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

  function extractText(v) {
    if (v == null) return '';
    if (typeof v === 'string') {
      const cleanV = v.trim().toLowerCase();
      if (cleanV.includes('[object object]') || cleanV === '[object object]') return '';
      return v;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      // Plain-text variants are used verbatim.
      const plain = [
        v.plainText,
        v.originalText && v.originalText.plainText,
        v.text,
        v.value
      ];
      for (const c of plain) {
        if (typeof c === 'string' && c) return c;
      }
      // HTML/markdown variants are stripped and entity-decoded.
      const html = [
        v.plaidHtml,
        v.originalText && v.originalText.plaidHtml,
        v.markdown
      ];
      for (const c of html) {
        if (typeof c === 'string' && c) return cleanHtml(c);
      }
    }
    return '';
  }

  const scalarField = (v) => (v != null && typeof v === 'object') ? extractText(v) : (v == null ? '' : v);

  function normalizeMovies(movies) {
    if (!Array.isArray(movies)) return [];
    return movies.map((m) => {
      if (!m || typeof m !== 'object') return {};
      let desc = m.description;
      if (desc != null && typeof desc === 'object') {
        desc = extractText(desc);
      }
      if (typeof desc === 'string') {
        const clean = desc.trim().toLowerCase();
        if (clean.includes('[object object]') || clean === '[object object]') {
          desc = '';
        }
      } else {
        desc = '';
      }
      return {
        position:       scalarField(m.position),
        imdb_id:        scalarField(m.imdb_id),
        type:           scalarField(m.type),
        title:          scalarField(m.title),
        year:           scalarField(m.year),
        rating:         scalarField(m.rating),
        votes:          scalarField(m.votes),
        genre:          scalarField(m.genre),
        content_rating: scalarField(m.content_rating),
        duration:       scalarField(m.duration),
        description:    desc,
        imdb_url:       scalarField(m.imdb_url)
      };
    });
  }

  function buildFormattedContent(list, format) {
    const movies = normalizeMovies(list.movies || []);
    const name = list.name;
    switch (format) {
      case 'csv': return toCSV(name, movies);
      case 'json': return toJSON(name, movies);
      case 'plain': return toPlainText(name, movies);
      case 'markdown': return toMarkdownTable(name, movies);
      default: return toCSV(name, movies);
    }
  }

  function sanitizeFileName(name) {
    return String(name || 'imdb-list')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'imdb-list';
  }

  function getFileInfo(format) {
    const map = {
      csv: { ext: 'csv', mime: 'text/csv' },
      json: { ext: 'json', mime: 'application/json' },
      plain: { ext: 'txt', mime: 'text/plain' },
      markdown: { ext: 'md', mime: 'text/markdown' }
    };
    return map[format] || map.csv;
  }

  function formatLabel(format) {
    const labels = {
      csv: 'CSV',
      json: 'JSON',
      plain: 'Plain Text',
      markdown: 'Markdown Table'
    };
    return labels[format] || 'CSV';
  }

  async function getCurrentFormat() {
    const data = await new Promise(resolve => {
      chrome.storage.local.get('imdb_prefs', resolve);
    });
    const storedFormat = data?.imdb_prefs?.defaultFormat;
    const allowed = new Set(['csv', 'json', 'plain', 'markdown']);
    const format = allowed.has(storedFormat) ? storedFormat : 'csv';
    defaultFormat = format;
    return format;
  }

  async function handleCopy(list) {
    try {
      const format = await getCurrentFormat();
      const content = buildFormattedContent(list, format);
      await writeTextWithFallback(content);
      showHomeStatus(`Copied ${list.name} as ${formatLabel(format)}.`);
    } catch {
      showHomeStatus('Clipboard permission blocked. Use Download instead.', true);
    }
  }

  async function handleDownload(list) {
    const format = await getCurrentFormat();
    const content = buildFormattedContent(list, format);
    const info = getFileInfo(format);
    const filename = `${sanitizeFileName(list.name)}.${info.ext}`;
    const blob = new Blob([content], { type: info.mime });
    await startDownloadFast(blob, filename);

    showHomeStatus(`Downloaded ${filename}.`);
  }

  async function startDownloadFast(blob, filename) {
    const directWorked = startAnchorDownload(blob, filename);
    if (directWorked) return;

    const blobUrl = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        URL.revokeObjectURL(blobUrl);
        if (chrome.runtime.lastError || !downloadId) {
          reject(new Error(chrome.runtime.lastError?.message || 'Download failed'));
          return;
        }
        resolve(downloadId);
      });
    });
  }

  function startAnchorDownload(blob, filename) {
    try {
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      return true;
    } catch {
      return false;
    }
  }

  async function writeTextWithFallback(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // fall through
      }
    }

    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.appendChild(area);
    area.select();

    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) throw new Error('Copy failed');
  }

  let statusTimer = null;
  function showHomeStatus(message, isError = false) {
    const el = $('#home-status');
    if (!el) return;
    el.textContent = String(message || '').slice(0, 200);
    el.classList.remove('hidden', 'error');
    if (isError) el.classList.add('error');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.classList.add('hidden');
      statusTimer = null;
    }, 3000);
  }

  window.addEventListener('unload', () => {
    clearTimeout(statusTimer);
    pendingRequests.clear();
  });

  // --- Helpers ---

  function isValidIMDBListUrl(url) {
    if (!url || typeof url !== 'string' || url.length > 500) return false;
    return /^https?:\/\/(www\.)?imdb\.com\/list\/ls\d+/.test(url);
  }

  const str = (v, max) => String(v == null ? '' : v).slice(0, max);

  // Coerce an untrusted movie object into the known shape with bounded fields.
  function sanitizeMovieRecord(m) {
    if (!m || typeof m !== 'object') return null;
    let desc = m.description;
    if (desc != null && typeof desc === 'object') {
      desc = extractText(desc);
    }
    if (typeof desc === 'string') {
      const clean = desc.trim().toLowerCase();
      if (clean.includes('[object object]') || clean === '[object object]') {
        desc = '';
      }
    } else {
      desc = '';
    }
    const keywords = Array.isArray(m.keywords)
      ? m.keywords.map(k => str(k, 100).trim()).filter(Boolean)
      : [];
    return {
      position:       str(m.position, 12),
      imdb_id:        str(m.imdb_id, 20),
      type:           str(m.type, 40),
      title:          str(m.title, 500),
      year:           str(m.year, 12),
      rating:         str(m.rating, 12),
      votes:          str(m.votes, 20),
      genre:          str(m.genre, 300),
      content_rating: str(m.content_rating, 40),
      duration:       str(m.duration, 40),
      description:    desc,
      imdb_url:       str(m.imdb_url, 500),
      keywords:       keywords
    };
  }

  // Coerce an untrusted list object from an imported backup. Returns null when
  // the entry has no usable movies. A non-IMDB url is dropped to '' so it can
  // never be rendered as an attribute or reused for a network refresh.
  function sanitizeImportedList(list) {
    if (!list || typeof list !== 'object') return null;

    const movies = (Array.isArray(list.movies) ? list.movies : [])
      .slice(0, 10000)
      .map(sanitizeMovieRecord)
      .filter(Boolean);

    if (movies.length === 0) return null;

    const url = isValidIMDBListUrl(list.url) ? list.url : '';
    const rawId = str(list.id, 60).trim();
    const id = rawId || generateId(url || '');

    let lastRefreshed = null;
    if (list.lastRefreshed) {
      const t = new Date(list.lastRefreshed).getTime();
      if (Number.isFinite(t)) lastRefreshed = new Date(t).toISOString();
    }

    return {
      id,
      name: str(list.name, 500) || 'Untitled List',
      url,
      movies,
      movieCount: movies.length,
      lastRefreshed,
      thumbnail: null
    };
  }

  function generateId(url) {
    const match = url.match(/ls\d+/);
    return match ? match[0] : 'list-' + Date.now();
  }

  function setLoading(loading) {
    const btn = $('#fetch-btn');
    const text = $('#fetch-text');
    const spinner = $('#fetch-spinner');

    btn.disabled = loading;
    text.textContent = loading ? 'Fetching...' : 'Fetch List';
    spinner.classList.toggle('hidden', !loading);
  }

  function showError(msg) {
    const el = $('#error-msg');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function showPreview(data) {
    $('#preview-name').textContent = data.listName;
    $('#preview-count').textContent = `${data.movies.length} titles`;
    $('#preview-section').classList.remove('hidden');
  }

  function formatRelativeTime(isoStr) {
    if (!isoStr) return 'Never refreshed';

    const then = new Date(isoStr).getTime();
    if (!Number.isFinite(then)) return 'Never refreshed';

    const diff = Date.now() - then;
    if (diff < 0) return 'Just now'; // clock skew / future timestamp
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return new Date(then).toLocaleDateString();
  }

  // Escapes for BOTH text and attribute contexts (quotes included), so values
  // interpolated into template-string HTML cannot break out of an attribute.
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Format converters ---

  function toCSV(listName, movies) {
    const headers = [
      'Position','IMDB_ID','Type','Title','Year','IMDB_Rating',
      'Votes','Genre','Content_Rating','Duration','Description','IMDB_URL'
    ];
    // Every field is quoted and guarded against CSV formula injection: a cell
    // beginning with = + - @ (or tab/CR) is prefixed with ' so spreadsheet
    // apps treat it as text rather than executing it as a formula.
    const cell = (s) => {
      let v = String(s == null ? '' : s).slice(0, 1000).replace(/\r?\n/g, ' ');
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return `"${v.replace(/"/g, '""')}"`;
    };
    const rows = [headers.map(cell).join(',')];
    for (const m of movies.slice(0, 10000)) {
      rows.push([
        m.position, m.imdb_id, m.type, m.title, m.year,
        m.rating, m.votes, m.genre, m.content_rating,
        m.duration, m.description, m.imdb_url
      ].map(cell).join(','));
    }
    return `# IMDB List: ${String(listName || 'IMDB List').slice(0, 200)}\n# Total: ${movies.length} items\n\n` + rows.join('\n');
  }

  function toJSON(listName, movies) {
    const output = {
      list_name: String(listName || 'IMDB List').slice(0, 500),
      total: movies.length,
      exported_at: new Date().toISOString(),
      movies: movies.slice(0, 10000).map((m) => ({
        position: m.position,
        imdb_id: m.imdb_id,
        type: m.type,
        title: String(m.title || '').slice(0, 500),
        year: m.year,
        imdb_rating: m.rating,
        votes: m.votes,
        genre: String(m.genre || '').slice(0, 500),
        content_rating: m.content_rating,
        duration: m.duration,
        description: String(m.description || '').slice(0, 2000),
        imdb_url: m.imdb_url
      }))
    };
    return JSON.stringify(output, null, 2);
  }

  function toPlainText(listName, movies) {
    const lines = [`IMDB List: ${String(listName || 'IMDB List').slice(0, 200)}`, `Total: ${movies.length} titles`, ''];
    for (const m of movies.slice(0, 10000)) {
      lines.push(`${m.position}. [${String(m.type || 'Title').slice(0, 20)}] ${String(m.title || '').slice(0, 200)} (${m.year})`);
      lines.push(`   Rating: ${m.rating}/10  |  Votes: ${m.votes}`);
      lines.push(`   Genre: ${String(m.genre || '').slice(0, 200)}  |  ${String(m.content_rating || '').slice(0, 50)}  |  ${m.duration}`);
      lines.push(`   ${String(m.description || '').slice(0, 500)}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  function toMarkdownTable(listName, movies) {
    const header = `## IMDB List: ${String(listName || 'IMDB List').slice(0, 200)}\n\n`;
    const cols = ['#', 'Type', 'Title', 'Year', 'Rating', 'Genre', 'Duration', 'Description'];
    const sep = cols.map(() => '---');
    // Escape pipes and collapse newlines so a value can't break out of its cell.
    const cell = (s, max) =>
      String(s == null ? '' : s).slice(0, max).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
    // A url only needs its closing paren / whitespace neutralised inside ( ).
    const urlCell = (s) =>
      String(s == null ? '' : s).slice(0, 500).replace(/[\s()]/g, encodeURIComponent);
    const rows = movies.slice(0, 10000).map((m) => [
      cell(m.position, 12),
      cell(m.type, 30),
      `[${cell(m.title, 100)}](${urlCell(m.imdb_url)})`,
      cell(m.year, 12),
      cell(m.rating, 12),
      cell(m.genre, 100),
      cell(m.duration, 40),
      cell(m.description, 200)
    ]);
    const tableLines = [
      `| ${cols.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((r) => `| ${r.join(' | ')} |`)
    ];
    return header + tableLines.join('\n');
  }

  // --- One-time storage migration ---
  // Older saved lists may store a field (notably description) as an IMDb
  // rich-text OBJECT. Rewrite those to clean strings in place so every surface
  // (list, export, backup) is correct without needing a re-fetch. Runs once per
  // load; only writes back when something actually changed.
  const MOVIE_FIELDS = [
    'position', 'imdb_id', 'type', 'title', 'year', 'rating',
    'votes', 'genre', 'content_rating', 'duration', 'description', 'imdb_url'
  ];

  function migrateStoredLists() {
    chrome.storage.local.get('imdb_lists', (data) => {
      if (chrome.runtime.lastError) return;
      const lists = Array.isArray(data.imdb_lists) ? data.imdb_lists : [];
      let changed = false;

      for (const list of lists) {
        if (!list || !Array.isArray(list.movies)) continue;
        for (const m of list.movies) {
          if (!m || typeof m !== 'object') continue;
          for (const key of MOVIE_FIELDS) {
            const cleanVal = m[key] == null ? '' : String(m[key]).trim().toLowerCase();
            if (cleanVal.includes('[object object]')) {
              m[key] = '';
              changed = true;
            } else if (m[key] != null && typeof m[key] === 'object') {
              m[key] = key === 'description' ? extractText(m[key]) : scalarField(m[key]);
              changed = true;
            }
          }
        }
      }

      if (changed) {
        chrome.storage.local.set({ imdb_lists: lists }, () => {
          if (!chrome.runtime.lastError) renderLists();
        });
      }
    });
  }

  // --- Keywords Fetch Controller ---
  const _hideTimers = new Map();

  function handleKeywordsFetchClick(list) {
    const missing = list.movies.filter(m => !m.keywords || !Array.isArray(m.keywords)).length;
    const force = missing === 0;
    if (force && !confirm('All keywords are already fetched for this list. Refetch keywords for all titles?')) {
      return;
    }
    // Show immediate optimistic feedback
    showKeywordProgress(list.id, 'running', 0, force ? list.movies.length : missing, '', 'Starting...');
    chrome.runtime.sendMessage({ type: 'START_KEYWORD_FETCH', listId: list.id, force }, (response) => {
      // Update with authoritative count from background (unwrap nested status)
      if (response && response.success && response.status) {
        const s = response.status;
        showKeywordProgress(list.id, 'running', s.fetchedCount || 0, s.totalCount || 0, '', 'Starting...');
      }
    });
  }

  function showKeywordProgress(listId, status, fetchedCount, totalCount, errorMsg, lastFetchedTitle) {
    const container = $(`#kw-progress-${listId}`);
    const statusText = $(`#kw-status-${listId}`);
    const countText = $(`#kw-count-${listId}`);
    const bar = $(`#kw-bar-${listId}`);
    const cancelBtn = container ? container.querySelector('.kw-action-link.cancel') : null;
    const resumeBtn = container ? container.querySelector('.kw-action-link.resume') : null;

    if (!container || !statusText || !countText || !bar) return;

    if (_hideTimers.has(listId)) {
      clearTimeout(_hideTimers.get(listId));
      _hideTimers.delete(listId);
    }

    container.classList.remove('hidden');
    statusText.style.color = '';

    const pct = totalCount > 0 ? Math.round((fetchedCount / totalCount) * 100) : 0;
    bar.style.width = `${pct}%`;
    countText.textContent = `${fetchedCount}/${totalCount}`;

    if (status === 'running') {
      statusText.textContent = lastFetchedTitle ? `Scraping: "${lastFetchedTitle}"` : 'Scraping keywords...';
      if (cancelBtn) cancelBtn.classList.remove('hidden');
      if (resumeBtn) resumeBtn.classList.add('hidden');
    } else if (status === 'complete') {
      statusText.textContent = 'Keywords successfully saved!';
      if (cancelBtn) cancelBtn.classList.add('hidden');
      if (resumeBtn) resumeBtn.classList.add('hidden');

      const timer = setTimeout(() => {
        container.classList.add('hidden');
        renderLists();
      }, 3000);
      _hideTimers.set(listId, timer);
    } else if (status === 'error') {
      statusText.textContent = errorMsg || 'Error fetching keywords.';
      statusText.style.color = 'var(--error)';
      if (cancelBtn) cancelBtn.classList.remove('hidden');
      if (resumeBtn) resumeBtn.classList.remove('hidden');
    } else if (status === 'cancelled') {
      statusText.textContent = 'Cancelled.';
      if (cancelBtn) cancelBtn.classList.add('hidden');
      if (resumeBtn) resumeBtn.classList.add('hidden');

      const timer = setTimeout(() => {
        container.classList.add('hidden');
        renderLists();
      }, 2000);
      _hideTimers.set(listId, timer);
    }
  }

  // Listen for progress updates from the background worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'KEYWORD_FETCH_PROGRESS') {
      showKeywordProgress(
        message.listId,
        message.status,
        message.fetchedCount,
        message.totalCount,
        message.errorMsg,
        message.lastFetchedTitle
      );
    }
  });

  // --- Init ---

  migrateStoredLists();
  renderLists();
})();