<p align="center">
  <img src="docs/assets/logo.svg" alt="Zoom Out Logo" width="128" height="128" />
</p>

<h1 align="center">Zoom Out</h1>

<p align="center">
  <strong>Every list deserves the big screen.</strong>
</p>

<p align="center">
  <a href="https://github.com/Ns81000/imdb-list-injector/releases"><img src="https://img.shields.io/badge/version-1.5.0-ff4d8b?style=flat-square" alt="Version"></a>
  <img src="https://img.shields.io/badge/manifest-v3-b8a4ed?style=flat-square" alt="Manifest v3">
  <img src="https://img.shields.io/badge/browser-chrome-ffb084?style=flat-square" alt="Chrome">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-a4d4c5?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://ns81000.github.io/imdb-list-injector/"><strong>🌐 Live Landing Page</strong></a> ·
  <a href="https://github.com/Ns81000/imdb-list-injector"><strong>💻 View Source</strong></a>
</p>

---

**Zoom Out** (formerly *IMDB List Injector*) is a Chrome extension that parses any public IMDb list into clean, structured data you can **copy or download** in seconds — ready for an AI chat, a spreadsheet, or a document. It then steps back and lets you **project that same list as a full-screen, backdrop-driven cinematic slideshow** with posters and high-resolution backdrops pulled live from TMDB.

Now with **IMDb keyword scraping** and **local AI-powered semantic clustering** via Ollama — discover hidden patterns across your movie library, then launch those clusters straight into the cinema player.

Everything runs locally in your browser to respect your security and privacy.

---

## ✨ Features

### 📋 Lists & Export
* **Detailed Metadata Extraction** — Captures title, year, IMDb rating, vote count, genre, content rating, duration, and plot description for every list item.
* **Multiple Export Formats** — Copy or download lists in a single click as **CSV, JSON, Plain Text, or Markdown Table**.
* **Full-List Pagination** — Automatically scrolls and fetches every page of large lists (not just the first 250 items).
* **Local Library Manager** — Save lists, refresh them on demand, and back up or restore your entire library as JSON.
* **Forgiving URL Normalization** — Automatically resolves standard, mobile (`m.imdb.com`), and bare URLs to standard canonical formats before fetching.
* **Bot-Challenge Detection** — Detects and surfaces accurate errors when IMDb's WAF returns a verification page instead of list data.
* **Concurrent-Safe Storage** — A serialized write-lock prevents concurrent refreshes, saves, or deletes from overwriting each other.
* **Private by Design** — All list metadata is stored locally. The parser only communicates directly with IMDb.

### 🏷️ Keywords
* **Per-Title Keyword Scraping** — Scrape IMDb's full keyword set for every title in a list, powered by a background queue with live progress, cancel, and resume.
* **Batch Persistence** — Keywords are saved in incremental batches (every 10 titles), so progress is never lost if a scrape is interrupted.
* **Keyword-Aware Refresh** — Refreshing a list preserves previously scraped keywords by mapping them forward to the new movie set.
* **Cross-Library Export** — Export all keywords across your entire library as a frequency-ranked JSON file, filtered to recurring keywords (≥2 occurrences).
* **Immersive Keyword Filters** — Keywords become a first-class filterable facet in both the Immersive config screen and the in-player filter overlay.

### 🧠 AI Clustering
* **Local AI Embedding** — Generates semantic embeddings for your scraped keywords using a local Ollama instance (`qwen3-embedding:0.6b`), with zero cloud dependencies.
* **Incremental Sync Engine** — Only embeds new keywords and prunes obsolete ones — cached in IndexedDB for instant re-loads.
* **Semantic Alignment Map** — Keywords are sorted by greedy nearest-neighbor cosine similarity, creating a continuous river of meaning you can visually scan.
* **Interactive Selection** — Search, browse, and select keyword clusters, then see the live count of matching movies.
* **AI → Immersive Pipeline** — Selected keywords resolve to their matching titles, which are passed directly into the Immersive cinema player for instant playback.
* **Embeddings Export** — Export the full IndexedDB vector database as JSON for external analysis.

### 🎭 Immersive Mode
* **Full-Screen Cinema Player** — Turn any saved list or your entire library into an elegant, responsive cinematic slideshow.
* **Dynamic, Content-Aware Filters** — Sort by, Type, Genre, Keywords, and Runtime pills are constructed dynamically from the actual data in your list.
* **Custom Sorting Options** — Sort by list order, alphabetical, IMDb rating, rating counts, release date, or runtime with a **Largest first / Smallest first** direction toggle.
* **Background Preloading & Streaming** — Immersive mode launches as soon as the first image resolves and keeps preloading posters/backdrops for future slides in the background.
* **Auto-Slideshow** — Automatically advance slides at a configurable interval: **5s / 10s / 25s / 50s**.
* **Hi-Res Backdrop Reels (Clips)** — Press **G** (or click the **Clips** button) to open an automated slideshow of the current title's alternative high-resolution backdrops.
* **In-Player Filter Sheet** — Re-filter, shuffle, or re-sort live with a translucent overlay side panel without leaving the player.
* **Keyboard Navigation** — `←/→` to navigate, `Space` to toggle autoplay, `G` for clips, `F` for fullscreen, and `Esc` to close overlays.
* **Accessibility Minded** — Full support for `prefers-reduced-motion` animations and responsive mobile/tablet scales.

### 🔒 Security & Privacy
* **Bring Your Own TMDB Key** — Utilizes your own free API key for backdrop assets.
* **Encrypted at Rest** — Your TMDB API key is encrypted using **AES-256-GCM** with a key derived via **PBKDF2-SHA256 (310,000 iterations and a random salt)**.
* **Unlock Once Per Session** — Decrypted keys live in memory (`chrome.storage.session`) for the browser session and are cleared when Chrome is closed.

---

## 📤 Export Formats

* **CSV** — Spreadsheet-friendly layout featuring built-in CSV-injection protection.
* **JSON** — Fully structured objects adhering to a stable database schema.
* **Plain Text** — Clean, human-readable bullet points.
* **Markdown Table** — Ready-to-paste tables optimized for documentation and LLMs.

Choose your preferred default format under **Settings** (the gear icon) to customize both the **Copy** and **Download** button triggers.

---

## ⚙️ Installation

1. **Clone or download** this repository to your computer:
   ```bash
   git clone https://github.com/Ns81000/imdb-list-injector.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** (top-right corner).
4. Click **Load unpacked** (top-left) and select the repository's root folder.

*To pull updates later: do a `git pull` and click the ↻ (refresh) icon on the **Zoom Out** extension card.*

---

## 🚀 Usage

### Saving and exporting a list
1. Launch **Zoom Out** from your extension toolbar or Chrome's Side Panel.
2. Click **Add List**, paste a public IMDb list URL, and hit **Fetch**.
3. The list will load and persist in your library.
4. Click **Copy** or **Download** on any list card to export.
5. Use the footer actions to **Export Backup** or **Import Backup** your entire saved database.

### Scraping keywords
1. Click **Keywords** on any list card.
2. The background worker scrapes every title's keywords page on IMDb with a live progress bar.
3. Once complete, keywords are saved per movie and survive list refreshes.
4. To re-scrape from scratch, click **Keywords** again when all are already fetched.

### Setting up Immersive mode
1. Generate a free API key from [TMDB Settings → API](https://www.themoviedb.org/settings/api) (v3 key or v4 read token).
2. Open **Settings** (gear icon) → **TMDB API Key**.
3. Paste the key, choose a local **passphrase**, and save. The key is validated against TMDB, then encrypted and saved.

### Launching the slideshow
* Click **Immersive** on a list card to project that list, or the **Immersive** icon in the header to project your whole library.
* Enter your passphrase to decrypt the API key for the current browser session.
* Configure filters or sorting on the lobby screen, then press **Start**.

### AI Clustering
1. Click the **AI Clustering** icon (three connected nodes) in the extension header.
2. If this is your first time, install [Ollama](https://ollama.com/download) and pull the embedding model:
   ```bash
   ollama pull qwen3-embedding:0.6b
   ```
3. The extension connects to Ollama locally, embeds your scraped keywords, and sorts them by semantic similarity.
4. Browse the alignment map, search keywords, and select clusters.
5. Click **Start Immersive Playback** to launch the cinema player with only the movies matching your selected keywords.

---

## 🔍 Permissions & Security

| Permission | Why |
| --- | --- |
| `storage` & `unlimitedStorage` | To store your library, theme settings, encrypted API credentials, and image caches locally. |
| `downloads` | To download structured backup logs and exported data files directly. |
| `clipboardWrite` | To copy formatted markdown tables or text to your clipboard. |
| `sidePanel` | To run the extension UI inside Chrome's native side panel. |
| `declarativeNetRequestWithHostAccess` | To modify outgoing request headers for local Ollama CORS bypass. |
| `host_permissions: www.imdb.com` | To directly fetch and parse public IMDb lists and keyword pages. |
| `host_permissions: localhost:11434` | To communicate with a local Ollama instance for AI embeddings. |

**Network security** is restricted by a strict Content Security Policy to:
* `www.imdb.com` (Fetching lists and keyword pages)
* `api.themoviedb.org` (Resolving metadata and imagery)
* `image.tmdb.org` (Retrieving poster and backdrop pictures)
* `localhost:11434` (Local Ollama AI model — never leaves your machine)

---

## 📂 Project Structure

```
manifest.json            MV3 configurations, permissions, and Content Security Policy
src/
  background.js          Background service worker: fetching, parsing, keyword queue, Ollama proxy
  parser.js              Parsing logic (JSON-LD + __NEXT_DATA__ + keywords extraction)
  popup/                 Side-panel extension UI, settings, and library management
    popup.html
    popup.css
    popup.js
  immersive/             Slideshow player code (interactive backdrop theater)
    immersive.html
    immersive.css
    immersive.js
  embeddings/            AI Clustering page (Ollama + semantic alignment)
    embeddings.html
    embeddings.css
    embeddings.js
  lib/
    crypto.js            AES-GCM + PBKDF2 cryptography layer (Web Crypto API)
    tmdb.js              TMDB API handler, caching utility, and image resolver
```

---

## 🛡️ Privacy Policy

* **100% Local Processing** — All saved lists, keywords, and embeddings live in your browser (`chrome.storage.local` and `IndexedDB`).
* **Zero Third-Party Servers** — The extension communicates only with official IMDb and TMDB end-points, plus your own local Ollama instance. There are no tracking scripts, analytics, or intermediate servers.
* **Robust Encryption** — Credentials are never stored as plain text. The encryption key is derived dynamically in memory.
* **Local AI Only** — Embedding models run entirely on your machine via Ollama. No keyword or movie data is ever sent to a cloud service.
