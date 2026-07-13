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
          <div class="list-card-info">
            <div class="list-card-name">
              ${escapeHtml(list.name)}
              <span class="list-card-count">${Number(list.movieCount) || 0}</span>
            </div>
            <div class="list-card-meta">${escapeHtml(formatRelativeTime(list.lastRefreshed))}</div>
            <div class="list-card-actions-row">
              <button class="list-action-btn copy-btn" data-idx="${idx}" title="Copy formatted list">Copy</button>
              <button class="list-action-btn download-btn" data-idx="${idx}" title="Download formatted list">Download</button>
            </div>
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
      } else {
        showError((response && response.error) || 'Failed to fetch list. Please try again.');
      }
    });
  });

  $('#save-btn').addEventListener('click', () => {
    if (!currentPreview || !currentPreview.movies) return;
    if ($('#save-btn').disabled) return;

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

    $('#save-btn').disabled = true;
    chrome.runtime.sendMessage({ type: 'SAVE_LIST', listData }, (response) => {
      $('#save-btn').disabled = false;
      if (chrome.runtime.lastError) {
        showError(`Save failed: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (!response || !response.success) {
        showError(`Save failed: ${response?.error || 'unknown error'}`);
        return;
      }
      navigateTo('home');
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

  function buildFormattedContent(list, format) {
    switch (format) {
      case 'csv': return toCSV(list.name, list.movies || []);
      case 'json': return toJSON(list.name, list.movies || []);
      case 'plain': return toPlainText(list.name, list.movies || []);
      case 'markdown': return toMarkdownTable(list.name, list.movies || []);
      default: return toCSV(list.name, list.movies || []);
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
      description:    str(m.description, 2000),
      imdb_url:       str(m.imdb_url, 500)
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

  // --- Init ---

  renderLists();
})();