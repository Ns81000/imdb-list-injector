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
  let currentCategoryPeople = null;

  // View Mode: 'small' | 'grid'
  let currentViewMode = localStorage.getItem('imdb_credits_view_mode') || 'small';
  // Gender Filter: 'all' | 'male' | 'female'
  let currentGenderFilter = 'all';

  // Clips Reel state
  let clipsState = {
    active: false,
    timer: null,
    images: [],
    index: 0
  };

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
      setupViewToggleHandlers();
      setupGenderFilterHandlers();
      setupModalHandlers();
      setupClipsViewerHandlers();

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

  function normalizePerson(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const clean = entry.trim();
      if (!clean) return null;
      return { name: clean, nmId: null, gender: null, key: clean.toLowerCase() };
    }
    if (typeof entry === 'object') {
      const name = String(entry.name || '').trim();
      if (!name) return null;
      const nmId = entry.nmId || null;
      const gender = entry.gender || null;
      const key = (nmId || name).toLowerCase().trim();
      return { name, nmId, gender, key };
    }
    return null;
  }

  function aggregateCredits(lists) {
    const personMap = {
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
    const processedMovies = new Set();

    for (const list of lists) {
      if (!list || !Array.isArray(list.movies)) continue;
      for (const movie of list.movies) {
        if (!movie || !movie.credits || typeof movie.credits !== 'object') continue;
        if (processedMovies.has(movie.imdb_id)) continue;
        processedMovies.add(movie.imdb_id);

        const titleInfo = { imdb_id: movie.imdb_id, title: movie.title, type: movie.type, year: movie.year };
        for (const [role, items] of Object.entries(movie.credits)) {
          if (!personMap[role] || !Array.isArray(items)) continue;
          const seenKeysInMovie = new Set();

          for (const raw of items) {
            const parsed = normalizePerson(raw);
            if (!parsed || seenKeysInMovie.has(parsed.key)) continue;
            seenKeysInMovie.add(parsed.key);

            if (!personMap[role].has(parsed.key)) {
              personMap[role].set(parsed.key, {
                name: parsed.name,
                nmId: parsed.nmId,
                gender: parsed.gender,
                count: 0
              });
              titleMap[role].set(parsed.key, []);
            }

            const p = personMap[role].get(parsed.key);
            p.count += 1;
            if (parsed.nmId && !p.nmId) p.nmId = parsed.nmId;
            if (parsed.gender && !p.gender) p.gender = parsed.gender;
            titleMap[role].get(parsed.key).push(titleInfo);
          }
        }
      }
    }

    const sorted = {};
    let totalPeople = 0;
    for (const [role, map] of Object.entries(personMap)) {
      sorted[role] = Array.from(map.entries())
        .map(([key, data]) => ({
          name: data.name,
          nmId: data.nmId,
          gender: data.gender,
          count: data.count,
          key,
          titles: titleMap[role].get(key) || []
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
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

  // --- View Toggle & Filter Handlers ---

  function setupViewToggleHandlers() {
    const btnSmall = $('#btn-view-small');
    const btnGrid = $('#btn-view-grid');

    if (btnSmall && btnGrid) {
      if (currentViewMode === 'grid') {
        btnGrid.classList.add('active');
        btnSmall.classList.remove('active');
      } else {
        btnSmall.classList.add('active');
        btnGrid.classList.remove('active');
      }

      btnSmall.addEventListener('click', () => {
        if (currentViewMode === 'small') return;
        currentViewMode = 'small';
        localStorage.setItem('imdb_credits_view_mode', 'small');
        btnSmall.classList.add('active');
        btnGrid.classList.remove('active');
        applyViewMode();
      });

      btnGrid.addEventListener('click', () => {
        if (currentViewMode === 'grid') return;
        currentViewMode = 'grid';
        localStorage.setItem('imdb_credits_view_mode', 'grid');
        btnGrid.classList.add('active');
        btnSmall.classList.remove('active');
        applyViewMode();
      });
    }
  }

  function applyViewMode() {
    const grids = document.querySelectorAll('.credits-grid');
    grids.forEach(grid => {
      if (currentViewMode === 'grid') {
        grid.classList.add('view-grid');
        grid.classList.remove('view-small');
      } else {
        grid.classList.add('view-small');
        grid.classList.remove('view-grid');
      }
    });

    document.querySelectorAll('.person-card').forEach(card => {
      const img = card.querySelector('img');
      if (img) {
        if (currentViewMode === 'grid') {
          img.className = 'person-grid-photo';
          if (card.dataset.highResUrl) {
            img.src = card.dataset.highResUrl;
          }
        } else {
          img.className = 'person-photo';
          if (card.dataset.profileUrl) {
            img.src = card.dataset.profileUrl;
          }
        }
      }
    });
  }

  function setupGenderFilterHandlers() {
    const pills = document.querySelectorAll('.gender-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentGenderFilter = pill.dataset.gender || 'all';
        filterVisibleCards();
      });
    });
  }

  function filterVisibleCards() {
    const cards = document.querySelectorAll('.person-card');
    const searchInput = $('#credits-search-input');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let visibleCount = 0;
    let totalCount = cards.length;

    cards.forEach(card => {
      const name = (card.dataset.name || '').toLowerCase();
      const gender = card.dataset.gender || 'null';

      const matchesSearch = !query || name.includes(query);
      const matchesGender = currentGenderFilter === 'all' || gender === currentGenderFilter;

      if (matchesSearch && matchesGender) {
        card.classList.remove('search-hidden');
        visibleCount++;
      } else {
        card.classList.add('search-hidden');
      }
    });

    const statsEl = $('#credits-search-stats');
    if (statsEl) {
      updateSearchStats(statsEl, visibleCount, totalCount);
    }
  }

  // --- Overview & Full List Views ---

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
          <div class="credits-grid ${currentViewMode === 'grid' ? 'view-grid' : 'view-small'}" id="grid-${cat.key}">
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

    content.querySelectorAll('.credits-show-all').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        const baseParams = new URLSearchParams({ scope, mode, category: cat });
        if (listId) baseParams.set('id', listId);
        window.location.search = baseParams.toString();
      });
    });

    attachPersonCardHandlers(content);
    loadPhotos();
  }

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
    currentCategoryPeople = people;
    const label = labels[cat] || cat;

    const searchContainer = $('#credits-search-container');
    if (searchContainer) {
      searchContainer.classList.remove('hidden');
    }

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
        <div class="credits-grid ${currentViewMode === 'grid' ? 'view-grid' : 'view-small'}" id="grid-${cat}">
          ${people.map((p, i) => personCardHtml(p, i)).join('')}
        </div>
      </section>
    `;

    content.innerHTML = html;

    const btnBack = $('#btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        const baseParams = new URLSearchParams({ scope, mode });
        if (listId) baseParams.set('id', listId);
        window.location.search = baseParams.toString();
      });
    }

    attachPersonCardHandlers(content);
    initSearch(cat);
    loadPhotos();
  }

  // --- Person Card HTML Generator ---

  function personCardHtml(person, index) {
    const initials = getInitials(person.name);
    const escapedName = escapeHtml(person.name);
    const titleCount = person.count;
    const titlesJson = escapeHtml(JSON.stringify(
      (person.titles || []).map(t => t.imdb_id).filter(Boolean)
    ));
    const nmId = person.nmId || '';
    const gender = person.gender || 'null';

    return `
      <div class="person-card" 
           data-name="${escapedName}" 
           data-nm-id="${escapeHtml(nmId)}" 
           data-gender="${escapeHtml(gender)}"
           data-titles="${titlesJson}" 
           data-index="${index}">
        <div class="person-card-inner">
          <div class="person-photo-container">
            <div class="person-placeholder" data-name-key="${escapeHtml(person.key)}">
              ${initials}
            </div>
          </div>
          <div class="person-card-meta">
            <span class="person-name" title="${escapedName}">${escapedName}</span>
            <span class="person-count">${titleCount} title${titleCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
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

  // --- Person Card Click → Choice Modal ---

  let selectedPersonData = null;

  function attachPersonCardHandlers(container) {
    container.querySelectorAll('.person-card').forEach(card => {
      card.addEventListener('click', () => {
        const titlesJson = card.dataset.titles;
        if (!titlesJson) return;
        let titleIds;
        try {
          titleIds = JSON.parse(titlesJson);
        } catch { return; }

        const name = card.dataset.name;
        const nmId = card.dataset.nmId;
        const tmdbId = card.dataset.tmdbId || null;
        const profileUrl = card.dataset.profileUrl || null;
        const highResUrl = card.dataset.highResUrl || null;

        selectedPersonData = {
          name,
          nmId,
          tmdbId,
          titleIds,
          profileUrl,
          highResUrl
        };

        openPersonModal(selectedPersonData);
      });
    });
  }

  function setupModalHandlers() {
    const modal = $('#person-action-modal');
    const btnClose = $('#btn-modal-close');
    const btnImmersive = $('#btn-option-immersive');
    const btnClips = $('#btn-option-clips');

    if (!modal) return;

    const closeModal = () => modal.classList.add('hidden');

    if (btnClose) btnClose.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    if (btnImmersive) {
      btnImmersive.onclick = () => {
        closeModal();
        if (selectedPersonData && selectedPersonData.titleIds) {
          openImmersiveWithTitles(selectedPersonData.titleIds, selectedPersonData.name);
        }
      };
    }

    if (btnClips) {
      btnClips.onclick = () => {
        closeModal();
        if (selectedPersonData) {
          launchPersonClipsReel(selectedPersonData);
        }
      };
    }
  }

  function openPersonModal(person) {
    const modal = $('#person-action-modal');
    if (!modal) return;

    $('#modal-person-name').textContent = person.name || 'Unknown Person';
    $('#modal-person-sub').textContent = `${(person.titleIds || []).length} linked title${person.titleIds.length !== 1 ? 's' : ''}`;

    const wrapper = $('#modal-avatar-wrapper');
    if (wrapper) {
      if (person.profileUrl || person.highResUrl) {
        wrapper.innerHTML = `<img src="${person.highResUrl || person.profileUrl}" class="modal-avatar-img" alt="${escapeHtml(person.name)}"/>`;
      } else {
        wrapper.innerHTML = `<div class="person-placeholder">${getInitials(person.name)}</div>`;
      }
    }

    modal.classList.remove('hidden');
  }

  function openImmersiveWithTitles(imdbIds, personName) {
    chrome.storage.local.get('imdb_tmdb_key', (data) => {
      if (!data || !data.imdb_tmdb_key) {
        alert('Add your TMDB API key in the extension settings to use Immersive mode.');
        return;
      }

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

  // --- Dedicated Full-Screen Person Clips Reel ---

  const CLIPS_INTERVAL_MS = 4000;

  function setupClipsViewerHandlers() {
    const btnClose = $('#btn-person-clips-close');
    if (btnClose) btnClose.onclick = closePersonClipsReel;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && clipsState.active) {
        closePersonClipsReel();
      }
    });
  }

  async function launchPersonClipsReel(person) {
    const layer = $('#person-clips-layer');
    if (!layer) return;

    clipsState.active = true;
    clipsState.images = [];
    clipsState.index = 0;
    clearTimeout(clipsState.timer);

    layer.classList.add('is-open');
    $('#person-clips-backdrop').innerHTML = '<div class="person-clips-spinner"></div>';
    $('#person-clips-empty').classList.add('hidden');
    resetClipsProgress(false);

    let images = [];

    // 1. Try IMDb MediaViewer scraper via background service worker
    if (person.nmId) {
      try {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'FETCH_IMDB_PERSON_CLIPS', nmId: person.nmId }, resolve);
        });
        if (resp && resp.success && Array.isArray(resp.images) && resp.images.length > 0) {
          images = resp.images;
        }
      } catch {}
    }

    // 2. Fallback to TMDB person gallery images if IMDb returned 0 images
    if (images.length === 0 && (person.tmdbId || tmdbKey)) {
      try {
        let tmdbId = person.tmdbId;
        if (!tmdbId && tmdbKey) {
          const resolved = await globalThis.ImmersiveTmdb.resolvePersonByImdbId(person.nmId, person.name, tmdbKey);
          if (resolved) tmdbId = resolved.tmdbId;
        }
        if (tmdbId && tmdbKey) {
          images = await globalThis.ImmersiveTmdb.fetchPersonImages(tmdbId, tmdbKey);
        }
      } catch {}
    }

    if (images.length === 0) {
      $('#person-clips-backdrop').innerHTML = '';
      $('#person-clips-empty').classList.remove('hidden');
      return;
    }

    clipsState.images = images;
    renderClipSlide(0);
    restartClipsTimer();
  }

  function renderClipSlide(idx) {
    const backdrop = $('#person-clips-backdrop');
    if (!backdrop || !clipsState.images.length) return;

    const imgData = clipsState.images[idx % clipsState.images.length];
    const oldImgs = Array.from(backdrop.children);

    const imgNode = document.createElement('img');
    imgNode.className = 'person-clip-img';
    imgNode.decoding = 'async';
    const activate = () => requestAnimationFrame(() => imgNode.classList.add('is-active'));
    imgNode.onload = activate;
    imgNode.onerror = () => imgNode.remove();
    imgNode.src = imgData.url;
    if (imgNode.complete && imgNode.naturalWidth > 0) activate();

    backdrop.appendChild(imgNode);
    setTimeout(() => oldImgs.forEach(o => o.remove()), 900);
  }

  function restartClipsTimer() {
    clearTimeout(clipsState.timer);
    resetClipsProgress(true);
    clipsState.timer = setTimeout(advancePersonClips, CLIPS_INTERVAL_MS);
  }

  function advancePersonClips() {
    if (!clipsState.active || !clipsState.images.length) return;
    clipsState.index = (clipsState.index + 1) % clipsState.images.length;
    renderClipSlide(clipsState.index);
    restartClipsTimer();
  }

  function resetClipsProgress(run) {
    const bar = $('#person-clips-bar');
    if (!bar) return;
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    if (run) {
      bar.style.transition = `width ${CLIPS_INTERVAL_MS}ms linear`;
      bar.style.width = '100%';
    }
  }

  function closePersonClipsReel() {
    clipsState.active = false;
    clearTimeout(clipsState.timer);
    clipsState.images = [];
    const layer = $('#person-clips-layer');
    if (layer) layer.classList.remove('is-open');
    $('#person-clips-backdrop').innerHTML = '';
    $('#person-clips-empty').classList.add('hidden');
    resetClipsProgress(false);
  }

  // --- TMDB Photos & Gender Loading ---

  async function loadPhotos() {
    if (!tmdbKey) return;

    const placeholders = document.querySelectorAll('.person-placeholder');
    const seen = new Set();

    for (const el of placeholders) {
      const nameKey = el.dataset.nameKey;
      if (!nameKey || seen.has(nameKey)) continue;
      seen.add(nameKey);

      // Find matching person object
      let cardEl = el.closest('.person-card');
      let name = cardEl ? cardEl.dataset.name : nameKey;
      let nmId = cardEl ? cardEl.dataset.nmId : null;

      try {
        const result = await globalThis.ImmersiveTmdb.resolvePersonByImdbId(
          nmId, name, tmdbKey, null
        );

        if (result) {
          const profileUrl = result.profileUrl;
          const highResUrl = result.highResProfileUrl || profileUrl;
          const gender = result.gender || null;

          document.querySelectorAll(`.person-placeholder[data-name-key="${CSS.escape(nameKey)}"]`).forEach(ph => {
            const parentCard = ph.closest('.person-card');
            if (parentCard) {
              if (gender) parentCard.dataset.gender = gender;
              if (result.tmdbId) parentCard.dataset.tmdbId = result.tmdbId;
              if (profileUrl) parentCard.dataset.profileUrl = profileUrl;
              if (highResUrl) parentCard.dataset.highResUrl = highResUrl;
            }

            if (profileUrl) {
              const img = document.createElement('img');
              img.src = currentViewMode === 'grid' ? highResUrl : profileUrl;
              img.alt = result.name || '';
              img.className = currentViewMode === 'grid' ? 'person-grid-photo' : 'person-photo';
              img.loading = 'lazy';
              img.onerror = () => {
                img.replaceWith(ph.cloneNode(true));
              };
              ph.replaceWith(img);
            }
          });
        }
      } catch (err) {
        if (err.rateLimited) {
          const delay = (err.retryAfter || 1) * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
        if (err.authFailed) return;
      }
    }
  }

  // --- Search Functionality ---

  function initSearch(cat) {
    const searchInput = $('#credits-search-input');
    const searchClear = $('#credits-search-clear');
    const searchStats = $('#credits-search-stats');
    const grid = $(`#grid-${cat}`);

    if (!searchInput || !grid) return;

    let searchTimeout = null;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (query) {
        searchClear.classList.remove('hidden');
      } else {
        searchClear.classList.add('hidden');
      }

      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterVisibleCards();
      }, 150);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.add('hidden');
      filterVisibleCards();
      searchInput.focus();
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstVisible = grid.querySelector('.person-card:not(.search-hidden)');
        if (firstVisible) {
          firstVisible.click();
        }
      }
    });

    updateSearchStats(searchStats, currentCategoryPeople.length, currentCategoryPeople.length);
  }

  function updateSearchStats(statsEl, visible, total) {
    if (!statsEl) return;
    
    if (visible === total) {
      statsEl.textContent = `Showing all ${total} people`;
      statsEl.classList.remove('has-results');
    } else if (visible === 0) {
      statsEl.textContent = 'No results found';
      statsEl.classList.remove('has-results');
    } else {
      statsEl.textContent = `Showing ${visible} of ${total} people`;
      statsEl.classList.add('has-results');
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
          nmId: p.nmId,
          gender: p.gender,
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
