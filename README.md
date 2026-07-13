# IMDB List Injector

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg?style=flat-square)
![Manifest](https://img.shields.io/badge/manifest-v3-green.svg?style=flat-square)
![Browser](https://img.shields.io/badge/browser-chrome-yellow.svg?style=flat-square)

IMDB List Injector is a Chrome extension that parses any public IMDB list and turns it into clean, structured data you can copy or download in seconds — ready to paste into an AI chat, a spreadsheet, or a document for tailored recommendations and deep-dive analysis.

## Features

- **Detailed Metadata Extraction:** Extract comprehensive movie details including title, year, IMDB rating, vote count, genre, content rating, duration, and plot description.
- **Multiple Export Formats:** Copy or download your parsed IMDB lists as CSV, JSON, Plain Text, or Markdown Tables.
- **Full-List Pagination:** Automatically fetches every page of large lists, not just the first 250 items.
- **Local Library:** Save lists, refresh them on demand, and back up or restore your whole library as JSON.
- **Private by Design:** Everything runs and is stored locally in your browser. The extension only ever talks to `www.imdb.com`.

## Export Formats

- CSV (spreadsheet-friendly)
- JSON
- Plain Text
- Markdown Table

## Installation

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/Ns81000/imdb-list-injector.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click on **Load unpacked** and select the directory containing the extension files.

## Usage

1. Open the **IMDB List Injector** extension from your Chrome toolbar or side panel.
2. Click **Add List**, paste a public IMDB list URL (`https://www.imdb.com/list/ls...`), and fetch it.
3. Save the list to your library.
4. Use **Copy** or **Download** on any saved list to export it in your chosen format, then paste it wherever you need it — including an AI chat.

Set your preferred export format under **Preferences**.
