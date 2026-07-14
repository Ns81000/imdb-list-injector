# IMDB List Injector

![Version](https://img.shields.io/badge/version-1.2.0-blue.svg?style=flat-square)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg?style=flat-square)
![Browser](https://img.shields.io/badge/browser-chrome-yellow.svg?style=flat-square)

IMDB List Injector is a Chrome extension that parses any public IMDB list into
clean, structured data you can **copy or download** in seconds — ready for an AI
chat, a spreadsheet, or a document — and then **project that same list as a
full-screen cinematic experience** with posters and backdrops pulled live from
TMDB.

Everything runs and is stored locally in your browser.

---

## Features

### Lists & export
- **Detailed metadata extraction** — title, year, IMDB rating, vote count,
  genre, content rating, duration, and plot description for every title.
- **Multiple export formats** — copy or download any list as **CSV, JSON, Plain
  Text, or Markdown Table**.
- **Full-list pagination** — automatically fetches every page of large lists,
  not just the first 250 items.
- **Local library** — save lists, refresh them on demand, and back up or restore
  your whole library as JSON.
- **Private by design** — list data is stored locally and the parser only ever
  talks to `www.imdb.com`.

### Immersive mode
- **Full-screen cinema player** — turn any saved list (or your whole library)
  into a backdrop-driven slideshow with poster, title, year, runtime, rating,
  overview, and genres.
- **Dynamic, per-list filters** — Sort by, Type, Genre, and Runtime pills are
  built from the actual data in the list. Options that aren't present never
  appear; runtime ranges are computed from the list's own spread (so a
  short-runtime TV list gets sensible buckets instead of movie-length ones).
- **Sort + direction** — sort by List order, Alphabetical, IMDb rating, Number
  of ratings, Release date, or Runtime, each with a **Largest first / Smallest
  first** toggle.
- **Streaming playback** — the player opens as soon as the first image resolves
  and keeps fetching the rest in the background, so you're never waiting on the
  whole list.
- **Complete-first ordering** — titles with a backdrop are shown first; titles
  missing an image are moved to the end and rendered with a clean placeholder.
- **Robust preloading** — the backdrop *and* poster for upcoming titles (ahead,
  behind, and the next shuffled items) are fetched and decoded in advance, so
  navigation is instant.
- **Auto slideshow** — shuffles through the whole list (covering every title
  once before repeating) at your chosen interval: **5s / 10s / 25s / 50s**.
- **In-player filter panel** — a translucent side sheet lets you re-filter or
  re-sort live without leaving the player; changes apply immediately and you
  just close it to resume.
- **Keyboard controls** — `←/→` navigate, `Space` toggles the slideshow, `F`
  toggles fullscreen, `Esc` closes an open panel or exits.
- **Respects `prefers-reduced-motion`** and works on desktop and mobile widths.

### Security & privacy
- **Bring your own TMDB key** — Immersive mode uses your own free TMDB API key.
- **Encrypted at rest** — your key is encrypted with a passphrase using
  **AES-GCM + PBKDF2** (Web Crypto). Only the ciphertext, salt, and IV are
  stored; the plaintext key and passphrase are never persisted.
- **Unlock once per session** — after you enter your passphrase, the decrypted
  key is held in memory (`chrome.storage.session`) for the browser session and
  cleared when the browser closes.

---

## Export formats

- **CSV** — spreadsheet-friendly, with CSV-injection guarding.
- **JSON** — structured, with a stable field schema.
- **Plain Text** — readable summary per title.
- **Markdown Table** — paste-ready for docs and AI chats.

Set your preferred format under **Settings** (the gear icon). It's used for both
the **Copy** and **Download** actions.

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Ns81000/imdb-list-injector.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the repository folder.

After pulling changes, click the **refresh** icon on the extension card in
`chrome://extensions/` to reload it.

---

## Usage

### Saving and exporting a list
1. Open **IMDB List Injector** from your toolbar or the side panel.
2. Click **Add List**, paste a public IMDB list URL
   (`https://www.imdb.com/list/ls...`), and fetch it.
3. The list is saved to your library.
4. Use **Copy** or **Download** on any list card to export it in your chosen
   format. Use **Refresh** to re-fetch, or the **✕** to delete.
5. **Export Backup / Import Backup** (footer) save or restore your entire
   library as a single JSON file.

### Setting up Immersive mode
1. Get a free API key from
   [TMDB → Settings → API](https://www.themoviedb.org/settings/api) (a v3 key or
   a v4 read token both work).
2. Open **Settings** (gear icon) → **TMDB API Key**.
3. Paste your key, choose a **passphrase**, and click **Save key**. The key is
   verified against TMDB, then encrypted and stored locally.

### Starting Immersive mode
- Click the **Immersive** button on any list card to project that list, or the
  **Immersive** icon in the header to project your whole library.
- Enter your passphrase once (first launch of the session) to unlock the key.
- Pick your Sort / Type / Genre / Runtime filters, then press **Start**.
- Inside the player: use the on-screen controls or keyboard, open **Slideshow**
  to auto-advance, or the **filter** icon to re-filter live.

---

## Permissions

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Save lists, preferences, the encrypted key, and the TMDB image cache locally. |
| `downloads` | Save exported files and library backups. |
| `clipboardWrite` | Copy formatted lists to the clipboard. |
| `sidePanel` | Run the extension in Chrome's side panel. |
| `host_permissions: www.imdb.com` | Fetch and parse public IMDB lists. |

**Network access** is limited by the Content Security Policy to:
`www.imdb.com` (list parsing), `api.themoviedb.org` (image lookup), and
`image.tmdb.org` (poster/backdrop images).

---

## Project structure

```
manifest.json            MV3 manifest, permissions, and CSP
src/
  background.js          Service worker: fetch/parse/save/refresh lists
  parser.js              IMDB list parser (JSON-LD + __NEXT_DATA__ strategies)
  popup/                 Side-panel UI: library, add/refresh, export, settings
    popup.html
    popup.css
    popup.js
  immersive/             Full-screen cinema player
    immersive.html
    immersive.css
    immersive.js
  lib/
    crypto.js            AES-GCM + PBKDF2 key encryption (Web Crypto)
    tmdb.js              TMDB client, image URLs, and cached lookups
```

---

## Privacy

- List data and preferences are stored in `chrome.storage.local`.
- Your TMDB key is stored **encrypted** (AES-GCM); the passphrase is never
  stored. The decrypted key lives only in `chrome.storage.session` for the
  active browser session.
- Resolved TMDB image data is cached locally (30-day TTL) to avoid repeat API
  calls; posters and backdrops are loaded directly from TMDB's image CDN.
- No analytics, no third-party servers — the extension talks only to IMDB and
  TMDB.
