// src/parser.js

function parseIMDBList(html) {
  if (!html || typeof html !== 'string' || html.length === 0) {
    return { listName: 'IMDB List', movies: [], method: 'none', success: false };
  }

  let movies = [], listName = 'IMDB List';
  let jsonLdResult = null;

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

  // Coerce an arbitrary IMDb text value into a clean plain string. IMDb delivers
  // some fields (e.g. a list creator's per-item note) not as a string but as a
  // nested "Markdown"/rich-text object such as:
  //   { originalText: { plainText, plaidHtml }, plainText, ... }
  // Plain-text variants are used verbatim; HTML/markdown variants are stripped
  // and entity-decoded. Unknown object shapes collapse to '' — so a value can
  // never leak to output as the literal "[object Object]".
  const extractText = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') {
      const cleanV = v.trim().toLowerCase();
      if (cleanV.includes('[object object]') || cleanV === '[object object]') return '';
      return v;
    }
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'object') {
      const plain = [
        v.plainText,
        v.originalText?.plainText,
        v.text,
        v.value
      ];
      for (const c of plain) {
        if (typeof c === 'string' && c) return c;
      }
      const html = [
        v.plaidHtml,
        v.originalText?.plaidHtml,
        v.markdown
      ];
      for (const c of html) {
        if (typeof c === 'string' && c) return cleanHtml(c);
      }
    }
    return '';
  };

  // Keep strings/numbers as-is; funnel any object through extractText so no
  // field can ever serialize to "[object Object]".
  const scalar = (v) => {
    if (v == null) return '';
    if (typeof v === 'object') return extractText(v);
    return v;
  };

  const sanitizeMovie = (m) => {
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
    return {
      position:       scalar(m.position),
      imdb_id:        scalar(m.imdb_id),
      type:           scalar(m.type),
      title:          scalar(m.title),
      year:           scalar(m.year),
      rating:         scalar(m.rating),
      votes:          scalar(m.votes),
      genre:          scalar(m.genre),
      content_rating: scalar(m.content_rating),
      duration:       scalar(m.duration),
      description:    desc,
      imdb_url:       scalar(m.imdb_url)
    };
  };

  const parseRuntimeFromISO8601 = (dur) => {
    if (!dur || typeof dur !== 'string') return '';
    const hMatch = dur.match(/(\d+)H/i);
    const mMatch = dur.match(/(\d+)M/i);
    if (hMatch && mMatch) return `${hMatch[1]}h ${mMatch[1]}m`;
    if (hMatch) return `${hMatch[1]}h`;
    if (mMatch) return `${mMatch[1]}m`;
    return '';
  };

  const parseRuntimeFromSeconds = (seconds) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  // Strategy 1: JSON-LD (fallback)
  const ldScriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldScriptRegex.exec(html)) !== null) {
    try {
      const raw = ldMatch[1].trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : [parsed];

      for (const ld of candidates) {
        if (!ld || typeof ld !== 'object') continue;
        const items = ld.itemListElement || [];
        if (!Array.isArray(items) || items.length === 0) continue;

        listName = ld.name || listName;
        movies = [];

        for (const [idx, entry] of items.entries()) {
          const item = entry?.item || {};
          const imdbUrl = item.url || '';
          const yearMatch = String(item.datePublished || '').match(/\d{4}/);
          const movie = {
            position:       entry?.position || (idx + 1),
            imdb_id:        imdbUrl.split('/title/')[1]?.replace('/', '') || '',
            type:           item['@type'] || '',
            title:          item.name || '',
            year:           yearMatch ? yearMatch[0] : '',
            rating:         item.aggregateRating?.ratingValue || '',
            votes:          item.aggregateRating?.ratingCount || '',
            genre:          Array.isArray(item.genre) ? item.genre.join(', ') : (item.genre || ''),
            content_rating: item.contentRating || '',
            duration:       parseRuntimeFromISO8601(item.duration),
            description:    item.description || '',
            imdb_url:       imdbUrl
          };
          const sanitized = sanitizeMovie(movie);
          if (sanitized) movies.push(sanitized);
        }

        if (movies.length > 0) {
          jsonLdResult = { listName, movies, method: 'JSON-LD', totalItems: movies.length, success: true };
          break;
        }
      }
      if (jsonLdResult) break;
    } catch (e) { /* fall through */ }
  }

  // Strategy 2: __NEXT_DATA__
  const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (ndMatch) {
    try {
      const nd = JSON.parse(ndMatch[1]);
      const pageProps = nd?.props?.pageProps || {};

      // Legacy IMDb list payload shape.
      const legacyItems = pageProps.items || [];
      if (Array.isArray(legacyItems) && legacyItems.length > 0) {
        listName = pageProps.listDetails?.name || listName;
        movies = [];
        for (const entry of legacyItems) {
          const item = entry?.item || {};
          const movie = {
            position:    entry.listPosition || '',
            imdb_id:     item.id || '',
            type:        item.titleType?.text || item.titleType?.id || '',
            title:       item.titleText?.text || '',
            year:        item.releaseYear?.year || '',
            rating:      item.ratingsSummary?.aggregateRating || '',
            votes:       item.ratingsSummary?.voteCount || '',
            genre:       (item.genres?.genres || []).map(g => g?.text || g?.genre || '').filter(Boolean).join(', '),
            description: extractText(item.plot?.plotText) || '',
            imdb_url:    `https://www.imdb.com/title/${item.id || ''}/`
          };
          const sanitized = sanitizeMovie(movie);
          if (sanitized) movies.push(sanitized);
        }
        if (movies.length > 0) {
          return {
            listName,
            movies,
            method: '__NEXT_DATA__ (legacy)',
            totalItems: pageProps.totalItems || movies.length,
            success: true
          };
        }
      }

      // Current IMDb list payload shape.
      const listData = pageProps.mainColumnData?.list;
      const edges = listData?.titleListItemSearch?.edges || [];
      if (Array.isArray(edges) && edges.length > 0) {
        listName = listData?.name?.originalText || listData?.name || listName;
        movies = [];

        for (const [idx, entry] of edges.entries()) {
          const node = entry?.node || {};
          const item = entry?.listItem || {};
          const imdbId = item.id || node.itemId || '';
          const genres = (item.titleGenres?.genres || [])
            .map(g => g?.genre?.text || g?.text || '')
            .filter(Boolean)
            .join(', ');

          const movie = {
            position:       node.absolutePosition || (idx + 1),
            imdb_id:        imdbId,
            type:           item.titleType?.text || item.titleType?.id || '',
            title:          item.titleText?.text || '',
            year:           item.releaseYear?.year || '',
            rating:         item.ratingsSummary?.aggregateRating || '',
            votes:          item.ratingsSummary?.voteCount || '',
            genre:          genres,
            content_rating: item.certificate?.rating || '',
            duration:       parseRuntimeFromSeconds(item.runtime?.seconds),
            // Use the title's plot SYNOPSIS for the description — never the
            // creator's per-item note (node.description), which is a rich-text
            // object and not what belongs in a description column.
            description:    extractText(item.plot?.plotText) || '',
            imdb_url:       imdbId ? `https://www.imdb.com/title/${imdbId}/` : ''
          };
          const sanitized = sanitizeMovie(movie);
          if (sanitized) movies.push(sanitized);
        }

        if (movies.length > 0) {
          return {
            listName,
            movies,
            method: '__NEXT_DATA__ (mainColumnData)',
            totalItems: listData?.titleListItemSearch?.total || pageProps.totalItems || movies.length,
            success: true
          };
        }
      }

      return { listName, movies: [], method: '__NEXT_DATA__ (no items)', success: false };
    } catch (e) { /* fall through */ }
  }

  if (jsonLdResult) {
    return jsonLdResult;
  }

  return { listName, movies: [], method: 'none', success: false };
}

// Note: output formatting (CSV / JSON / plain text / Markdown) lives in
// src/popup/popup.js, which is the only consumer. parser.js is loaded by the
// service worker solely to expose parseIMDBList().
