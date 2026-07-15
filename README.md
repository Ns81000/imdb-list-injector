<p align="center">
  <img src="docs/assets/logo.svg" alt="Zoom Out Logo" width="128" height="128" />
</p>

<h1 align="center">Zoom Out</h1>

<p align="center">
  <strong>Every list deserves the big screen.</strong>
</p>

<p align="center">
  <a href="https://github.com/Ns81000/imdb-list-injector/releases"><img src="https://img.shields.io/badge/version-1.4.0-ff4d8b?style=flat-square" alt="Version"></a>
  <img src="https://img.shields.io/badge/manifest-v3-b8a4ed?style=flat-square" alt="Manifest v3">
  <img src="https://img.shields.io/badge/browser-chrome-ffb084?style=flat-square" alt="Chrome">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-a4d4c5?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://ns81000.github.io/imdb-list-injector/"><strong>🌐 Live Landing Page</strong></a> ·
  <a href="https://github.com/Ns81000/imdb-list-injector"><strong>💻 View Source</strong></a>
</p>

---

**Zoom Out** (formerly *IMDB List Injector*) is a lightweight Chrome extension that parses any public IMDb list into clean, structured data you can **copy or download** in seconds — ready for an AI chat, a spreadsheet, or a document. It then steps back and lets you **project that same list as a full-screen, backdrop-driven cinematic slideshow** with posters and high-resolution backdrops pulled live from TMDB.

Everything runs locally in your browser to respect your security and privacy.

---

## ✨ Features

### 📋 Lists & Export
* **Detailed Metadata Extraction** — Captures title, year, IMDb rating, vote count, genre, content rating, duration, and plot description for every list item.
* **Multiple Export Formats** — Copy or download lists in a single click as **CSV, JSON, Plain Text, or Markdown Table**.
* **Full-List Pagination** — Automatically scrolls and fetches every page of large lists (not just the first 250 items).
* **Local Library Manager** — Save lists, refresh them on demand, and back up or restore your entire library as JSON.
* **Forgiving URL Normalization** — Automatically resolves standard, mobile (`m.imdb.com`), and bare URLs to standard canonical formats before fetching.
* **Private by Design** — All list metadata is stored locally. The parser only communicates directly with IMDb.

### 🎭 Immersive Mode
* **Full-Screen Cinema Player** — Turn any saved list or your entire library into an elegant, responsive cinematic slideshow.
* **Dynamic, Content-Aware Filters** — Sort by, Type, Genre, and Runtime pills are constructed dynamically from the actual data in your list.
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

### Setting up Immersive mode
1. Generate a free API key from [TMDB Settings → API](https://www.themoviedb.org/settings/api) (v3 key or v4 read token).
2. Open **Settings** (gear icon) → **TMDB API Key**.
3. Paste the key, choose a local **passphrase**, and save. The key is validated against TMDB, then encrypted and saved.

### Launching the slideshow
* Click **Immersive** on a list card to project that list, or the **Immersive** icon in the header to project your whole library.
* Enter your passphrase to decrypt the API key for the current browser session.
* Configure filters or sorting on the lobby screen, then press **Start**.

---

## 🔍 Permissions & Security

| Permission | Why |
| --- | --- |
| `storage` & `unlimitedStorage` | To store your library, theme settings, encrypted API credentials, and image caches locally. |
| `downloads` | To download structured backup logs and exported data files directly. |
| `clipboardWrite` | To copy formatted markdown tables or text to your clipboard. |
| `sidePanel` | To run the extension UI inside Chrome's native side panel. |
| `host_permissions: www.imdb.com` | To directly fetch and parse public IMDb lists. |

**Network security** is restricted by a strict Content Security Policy to:
* `www.imdb.com` (Fetching lists)
* `api.themoviedb.org` (Resolving metadata and imagery)
* `image.tmdb.org` (Retrieving poster and backdrop pictures)

---

## 📂 Project Structure

```
manifest.json            MV3 configurations, permissions, and Content Security Policy
src/
  background.js          Background service worker: handles fetching, parsing, and sync
  parser.js              Implements parsing logic (JSON-LD + __NEXT_DATA__ fallbacks)
  popup/                 Side-panel extension UI, settings, and library management
    popup.html
    popup.css
    popup.js
  immersive/             Slideshow player code (interactive backdrop theater)
    immersive.html
    immersive.css
    immersive.js
  lib/
    crypto.js            AES-GCM + PBKDF2 cryptography layer (Web Crypto API)
    tmdb.js              TMDB API handler, caching utility, and image resolver
```

---

## 🛡️ Privacy Policy

* **100% Local Processing** — All saved lists and options live in your browser (`chrome.storage.local`).
* **Zero Third-Party Servers** — The extension communicates only with official IMDb and TMDB end-points. There are no tracking scripts, analytics, or intermediate servers.
* **Robust Encryption** — Credentials are never stored as plain text. The encryption key is derived dynamically in memory.
