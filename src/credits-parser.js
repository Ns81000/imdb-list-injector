// src/credits-parser.js
//
// Parses IMDb fullcredits pages to extract Director, Writers, Producers, and
// Cast names. Loaded by the service worker alongside parser.js.

function parseIMDbFullCredits(html) {
  if (!html || typeof html !== 'string' || html.length === 0) {
    return { Director: [], Writers: [], Producers: [], Cast: [] };
  }

  const credits = {
    Director: [],
    Writers: [],
    Producers: [],
    Cast: []
  };

  // The service worker has no native DOMParser. Use a regex-based approach
  // that mirrors the DOM selector logic.

  // Strategy: find each <section class="ipc-page-section"> block, extract its
  // title text, then extract person names from name-credits-list-item elements.

  // Split HTML into section blocks. IMDb wraps each department in a
  // <section class="ipc-page-section ..."> element.
  const sectionRegex = /<section[^>]*class="[^"]*ipc-page-section[^"]*"[^>]*>([\s\S]*?)(?=<section[^>]*class="[^"]*ipc-page-section|<\/main|$)/gi;
  let sectionMatch;

  while ((sectionMatch = sectionRegex.exec(html)) !== null) {
    const sectionHtml = sectionMatch[0];

    // Extract section title from ipc-title__text or ipc-title-link-wrapper
    const titleMatch = sectionHtml.match(
      /<(?:h[1-6]|span)[^>]*class="[^"]*ipc-title__text[^"]*"[^>]*>([\s\S]*?)<\/(?:h[1-6]|span)>/i
    ) || sectionHtml.match(
      /class="[^"]*ipc-title-link-wrapper[^"]*"[^>]*>\s*<(?:h[1-6])[^>]*>([\s\S]*?)<\/(?:h[1-6])>/i
    );

    if (!titleMatch) continue;

    const titleText = titleMatch[1]
      .replace(/<[^>]*>/g, '')
      .trim()
      .toLowerCase();

    let targetCategory = null;

    // Strict matching to avoid "Art Directors", "Second Unit Directors", "Casting" etc.
    if (titleText === 'director' || titleText === 'directors' || titleText === 'directed by') {
      targetCategory = 'Director';
    } else if (titleText === 'writer' || titleText === 'writers' || titleText === 'writing credits' || titleText === 'written by') {
      targetCategory = 'Writers';
    } else if (titleText === 'producer' || titleText === 'producers' || titleText === 'produced by') {
      targetCategory = 'Producers';
    } else if (titleText === 'cast' || titleText === 'cast (in credits order)' || titleText === 'series cast' || titleText === 'cast (in credits order) verified as complete') {
      targetCategory = 'Cast';
    }

    if (!targetCategory) continue;

    // Extract person names from list items.
    // Target: <li data-testid="name-credits-list-item"> ... <a class="name-credits--title-text-big">Name</a>
    const itemRegex = /<li[^>]*data-testid="name-credits-list-item"[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch;
    const seen = new Set();

    while ((itemMatch = itemRegex.exec(sectionHtml)) !== null) {
      const itemHtml = itemMatch[1];

      // Primary: <a class="name-credits--title-text-big">
      let nameMatch = itemHtml.match(
        /<a[^>]*class="[^"]*name-credits--title-text-big[^"]*"[^>]*>([\s\S]*?)<\/a>/i
      );

      // Fallback: first <a> that is NOT an ipc-lockup-overlay
      if (!nameMatch) {
        const allLinks = [];
        const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        let linkMatch;
        while ((linkMatch = linkRegex.exec(itemHtml)) !== null) {
          if (!/ipc-lockup-overlay/i.test(linkMatch[0])) {
            allLinks.push(linkMatch[1]);
          }
        }
        if (allLinks.length > 0) {
          nameMatch = [null, allLinks[0]];
        }
      }

      if (nameMatch) {
        const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          credits[targetCategory].push(name);
        }
      }
    }
  }

  return credits;
}
