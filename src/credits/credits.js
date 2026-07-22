(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const TOP_N = 30;

  const params = new URLSearchParams(window.location.search);
  const scope = params.get('scope') || 'all';
  const listId = params.get('id') || null;
  const mode = params.get('mode') || 'watching';
  const category = params.get('category') || null;

  const storageKey = mode === 'watched' ? 'imdb_lists_watched' : 'imdb_lists_watching';

  let allLists = [];
  let aggregated = null;
  let tmdbKey = null;

  init();

  async function init() {
    try {
      allLists = await loadLists();
      aggregated = aggregateCredits(allLists);

      if (aggregated.totalPeople === 0) {
        showEmpty();
        return;
      }

      tmdbKey = await getTmdbKey();

      if (category) {
        renderFullList(category);
      } else {
        renderOverview();
      }
    } catch (err) {
      showEmpty();
    }
  }

  function loadLists() {
    return new Promise((resolve) => {
      chrome.storage.local.get(storageKey, (data) => {
        const lists = Array.isArray(data[storageKey]) ? data[storageKey] : [];
        if (scope === 'list' && listId) {
          resolve(lists.filter(l => l.id === listId));
        } else {
          resolve(lists);
        }
      });
    });
  }

  function aggregateCredits(lists) {
    const counts = {
      Director: new Map(),
      Writers: new Map(),
      Producers: new Map(),
      Cast: new Map()
    };
    const titleMap = {
      Director: new Map(),
      Writers: new Map(),
      Producers: new Map(),
      Cast: new Map()
    };

    for (const list of lists) {
      if (!list || !Array.isArray(list.movies)) continue;
      for (const movie of list.movies) {
        if (!movie || !movie.credits || typeof movie.credits !== 'object') continue;
        const titleInfo = { imdb_id: movie.imdb_id, title: movie.title, type: movie.type, year: movie.year };
        for (const [role, names] of Object.entries(movie.credits)) {
          if (!counts[role] || !Array.isArray(names)) continue;
          for (const name of names) {
            const clean = String(name).trim();
            if (!clean) continue;
            counts[role].set(clean, (counts[role].get(clean) || 0) + 1);
            if (!titleMap[role].has(clean)) titleMap[role].set(clean, []);
            titleMap[role].get(clean).push(titleInfo);
          }
        }
      }
    }

    const sorted = {};
    let totalPeople = 0;
    for (const [role, map] of Object.entries(counts)) {
      sorted[role] = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count, titles: titleMap[role].get(name) || [] }));
      totalPeople += sorted[role].length;
    }

    const scopeLabel = scope === 'list' && lists.length > 0
      ? lists[0].name
      : `All ${mode} lists`;

    return { sorted, totalPeople, scopeLabel };
  }

  async function getTmdbKey() {
    return new Promise((resolve) => {
      chrome.storage.session.get('imdb_tmdb_key_plain', (data) => {
        if (data && data.imdb_tmdb_key_plain) {
          resolve(data.imdb_tmdb_key_plain);
        } else {
          chrome.storage.local.get('imdb_tmdb_key', async (localData) => {
            if (localData && localData.imdb_tmdb_key) {
              const pass = prompt('Unlock TMDB Photos: Enter your Immersive Mode passphrase');
              if (pass) {
                try {
                  const key = await globalThis.ImmersiveCrypto.decrypt(localData.imdb_tmdb_key, pass);
                  try { await chrome.storage.session.set({ imdb_tmdb_key_plain: key }); } catch {}
                  resolve(key);
                  return;
                } catch {
                  alert('Wrong passphrase. Photos will not load.');
                }
              }
            }
            resolve(null);
          });
        }
      });
    });
  }

  function showEmpty() {
    $('#credits-loading').classList.add('hidden');
    $('#credits-empty').classList.remove('hidden');
  }

  // --- Overview (Top 30 per category) ---

  function renderOverview() {
    $('#credits-loading').classList.add('hidden');
    const content = $('#credits-content');
    content.classList.remove('hidden');

    const scopeEl = $('#credits-scope');
    if (scopeEl && aggregated) {
      scopeEl.textContent = aggregated.scopeLabel;
    }

    const categories = [
      { key: 'Director', label: 'Directors' },
      { key: 'Writers', label: 'Writers' },
      { key: 'Producers', label: 'Producers' },
      { key: 'Cast', label: 'Cast' }
    ];

    let html = '';
    for (const cat of categories) {
      const people = aggregated.sorted[cat.key] || [];
      if (people.length === 0) continue;
      const topPeople = people.slice(0, TOP_N);
      const totalCount = people.length;

      html += `
        <section class="credits-category" data-role="${cat.key}">
          <div class="credits-category-header">
            <div class="credits-category-accent"></div>
            <h2 class="credits-category-title">${cat.label}</h2>
            <span class="credits-category-count">${totalCount} total</span>
          </div>
          <div class="credits-grid" id="grid-${cat.key}">
            ${topPeople.map((p, i) => personCardHtml(p, i)).join('')}
          </div>
          ${totalCount > TOP_N ? `
            <button class="credits-show-all" data-category="${cat.key}">
              Show All ${totalCount} ${cat.label} →
            </button>
          ` : ''}
        </section>
      `;
    }

    content.innerHTML = html;

    // Attach Show All handlers
    content.querySelectorAll('.credits-show-all').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        const baseParams = new URLSearchParams({ scope, mode, category: cat });
        if (listId) baseParams.set('id', listId);
        window.location.search = baseParams.toString();
      });
    });

    // Attach person card click handlers
    attachPersonCardHandlers(content);

    // Load TMDB photos
    loadPhotos();
  }

  // --- Full List View ---

  function renderFullList(cat) {
    $('#credits-loading').classList.add('hidden');
    const content = $('#credits-content');
    content.classList.remove('hidden');

    const scopeEl = $('#credits-scope');
    if (scopeEl && aggregated) {
      scopeEl.textContent = aggregated.scopeLabel;
    }

    const labels = { Director: 'Directors', Writers: 'Writers', Producers: 'Producers', Cast: 'Cast' };
    const people = aggregated.sorted[cat] || [];
    const label = labels[cat] || cat;

    let html = `
      <div class="credits-full-header">
        <button class="credits-back-btn" id="btn-back">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 3L5 8l5 5"/>
          </svg>
          Back
        </button>
        <h2 class="credits-full-title">All ${label}</h2>
        <span class="credits-full-count">${people.length} people</span>
      </div>
      <section class="credits-category" data-role="${cat}">
        <div class="credits-grid" id="grid-${cat}">
          ${people.map((p, i) => personCardHtml(p, i)).join('')}
        </div>
      </section>
    `;

    content.innerHTML = html;

    // Back button
    const btnBack = $('#btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        const baseParams = new URLSearchParams({ scope, mode });
        if (listId) baseParams.set('id', listId);
        window.location.search = baseParams.toString();
      });
    }

    attachPersonCardHandlers(content);
    loadPhotos();
  }

  // --- Person Card HTML ---

  function personCardHtml(person, index) {
    const initials = getInitials(person.name);
    const escapedName = escapeHtml(person.name);
    const titleCount = person.count;
    const titlesJson = escapeHtml(JSON.stringify(
      (person.titles || []).map(t => t.imdb_id).filter(Boolean)
    ));

    return `
      <div class="person-card" data-name="${escapedName}" data-titles="${titlesJson}" data-index="${index}">
        <div class="person-placeholder" data-name-key="${escapeHtml(person.name.toLowerCase().trim())}">
          ${initials}
        </div>
        <span class="person-name" title="${escapedName}">${escapedName}</span>
        <span class="person-count">${titleCount} title${titleCount !== 1 ? 's' : ''}</span>
      </div>
    `;
  }

  function getInitials(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }

  // --- Person Card Click → Immersive ---

  function attachPersonCardHandlers(container) {
    container.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', () => {
        const titlesJson = card.dataset.titles;
        if (!titlesJson) return;
        let titleIds;
        try {
          titleIds = JSON.parse(titlesJson);
        } catch { return; }
        if (!Array.isArray(titleIds) || titleIds.length === 0) return;

        openImmersiveWithTitles(titleIds, card.dataset.name);
      });
    });
  }

  function openImmersiveWithTitles(imdbIds, personName) {
    chrome.storage.local.get('imdb_tmdb_key', (data) => {
      if (!data || !data.imdb_tmdb_key) {
        alert('Add your TMDB API key in the extension settings to use Immersive mode.');
        return;
      }

      // Store filtered title IDs in session storage for the immersive player to pick up
      const filteredKey = 'imdb_credits_immersive_filter';
      chrome.storage.session.set({
        [filteredKey]: {
          imdbIds,
          personName: personName || '',
          mode,
          storageKey
        }
      }, () => {
        const params = new URLSearchParams({
          scope: 'credits-filter',
          mode,
          personName: personName || ''
        });
        const url = chrome.runtime.getURL(`src/immersive/immersive.html?${params.toString()}`);
        chrome.tabs.create({ url });
      });
    });
  }

  // --- TMDB Photo Loading ---

  async function loadPhotos() {
    if (!tmdbKey) return;

    const placeholders = document.querySelectorAll('.person-placeholder');
    const seen = new Set();

    for (const el of placeholders) {
      const nameKey = el.dataset.nameKey;
      if (!nameKey || seen.has(nameKey)) continue;
      seen.add(nameKey);

      try {
        const result = await globalThis.ImmersiveTmdb.searchPerson(
          nameKey, tmdbKey, null
        );
        if (result && result.profileUrl) {
          // Replace ALL placeholders with this name (could appear in multiple categories)
          document.querySelectorAll(`.person-placeholder[data-name-key="${CSS.escape(nameKey)}"]`).forEach(ph => {
            const img = document.createElement('img');
            img.src = result.profileUrl;
            img.alt = result.name || '';
            img.className = 'person-photo';
            img.loading = 'lazy';
            img.onerror = () => {
              img.replaceWith(ph.cloneNode(true));
            };
            ph.replaceWith(img);
          });
        }
      } catch (err) {
        if (err.rateLimited) {
          const delay = (err.retryAfter || 1) * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
        if (err.authFailed) {
          return;
        }
      }
    }
  }

  // --- Export ---

  const btnExport = $('#btn-export-credits');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (!aggregated) return;
      const exportData = {
        scope: aggregated.scopeLabel,
        mode,
        exportedAt: new Date().toISOString(),
        credits: {}
      };
      for (const [role, people] of Object.entries(aggregated.sorted)) {
        exportData.credits[role] = people.map(p => ({
          name: p.name,
          count: p.count,
          titles: (p.titles || []).map(t => ({ imdb_id: t.imdb_id, title: t.title }))
        }));
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const filename = `credits-analysis-${mode}-${Date.now()}.json`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    });
  }

  // --- Helpers ---

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
