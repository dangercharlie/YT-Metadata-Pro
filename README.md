<p align="center">
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Chrome Extension" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/YouTube_Data_API-v3-FF0000?style=flat&logo=youtube&logoColor=white" alt="YouTube Data API v3" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro/releases/latest"><img src="https://img.shields.io/github/v/release/dangercharlie/YT-Metadata-Pro?style=flat&label=Release" alt="Latest release" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Telemetry-None-238636?style=flat" alt="Telemetry" /></a>
  <br/>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro/actions/workflows/validate-extension.yml"><img src="https://github.com/dangercharlie/YT-Metadata-Pro/actions/workflows/validate-extension.yml/badge.svg" alt="Validate Extension workflow" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/API_Key-Local_Only-238636?style=flat&logo=lock&logoColor=white" alt="API key stored locally" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Status-Manual_Tested-007EC6?style=flat" alt="Manual tested" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Vibe_Coded-Human_Reviewed-007EC6?style=flat" alt="Vibe coded, human reviewed" /></a>
</p>

# YT Metadata Pro

**YT Metadata Pro** is a lightweight Chrome extension that saves you from opening every YouTube result just to check whether YouTube already marks it as licensed content.

It brings one useful metadata signal directly onto YouTube search/results pages: when the YouTube Data API reports `contentDetails.licensedContent === true`, the extension adds a clear green **MUSIC** badge to the thumbnail.

The core workflow is simple:

> Browse YouTube -> detect visible video IDs -> check YouTube metadata -> badge likely music matches

<p align="center">
  <img src="screenshots/music-badge-example.png" width="700" alt="YT Metadata Pro showing a green MUSIC badge on a YouTube search result thumbnail." />
</p>

---

## Why?

YouTube often exposes music attribution and licensing metadata, but it is usually buried inside watch pages, descriptions, or generated metadata panels.

YT Metadata Pro solves a narrower problem:

> I want to scan YouTube results and quickly see which visible videos are already flagged by YouTube as licensed content.

It is designed for metadata triage before opening every video manually.

---

## What It Does

- Runs as a Chrome extension on YouTube pages
- Detects visible YouTube video IDs from thumbnails/results
- Calls the YouTube Data API v3 `videos` endpoint
- Requests `part=contentDetails`
- Checks `contentDetails.licensedContent === true`
- Adds a green **MUSIC** badge to matching thumbnails
- Stores your YouTube API key locally in Chrome extension storage
- Keeps the extension package simple and inspectable

---

## What It Does Not Do

YT Metadata Pro is not a copyright oracle.

- It does not determine legal reuse rights
- It does not prove a video is safe to sample, remix, upload, monetize, or reuse
- It does not perform audio fingerprinting
- It does not download videos or audio
- It does not bypass YouTube limits, permissions, or platform controls
- It does not treat missing metadata as proof that a track is safe from copyright or other forms of audio fingerprinting elsewhere, especially outside of Content ID

No badge means:

> Not flagged by this metadata signal.

It does **not** mean:

> Safe to use.

---

## Installation

There are two simple ways to install or test YT Metadata Pro locally.

### Path 1: Manual Download / Load Unpacked

1. Clone or download this repo.
2. If you downloaded a ZIP from GitHub, extract it first.
3. Open Chrome and go to:

   ```text
   chrome://extensions/
   ```

4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the `extension/` folder.
7. Open the extension popup.
8. Paste your own YouTube Data API v3 key.
9. Reload any open YouTube tabs.

### Path 2: Build A ZIP Package

1. Clone this repo.
2. Run:

   ```bash
   npm run zip
   ```

3. The ZIP is written to:

   ```text
   dist/YT_Metadata_Pro_Extension.zip
   ```

4. Extract the generated ZIP.
5. Open Chrome and go to:

   ```text
   chrome://extensions/
   ```

6. Enable **Developer mode**.
7. Click **Load unpacked**.
8. Select the extracted ZIP folder.
9. Open the extension popup.
10. Paste your own YouTube Data API v3 key.
11. Reload any open YouTube tabs.

---

## YouTube API Key Setup

YT Metadata Pro requires your own YouTube Data API v3 key.

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable **YouTube Data API v3**.
4. Go to **APIs & Services -> Credentials**.
5. Create an **API key**.
6. Restrict the key to **YouTube Data API v3**.
7. Paste the key into the extension popup.

Do not commit API keys or paste them into issues, pull requests, screenshots, or chat.

---

## Development

This repo is intentionally plain.

YT Metadata Pro was created as a small browser-extension experiment using AI-assisted development and human review. The goal was to turn a narrow product idea into something testable quickly:

> Badge YouTube search/results thumbnails when YouTube's own metadata says a video contains licensed content.

The first working version came from a generated React/Vite wrapper that built the extension as downloadable string templates. After the core behavior was proven, the project was simplified into a direct Chrome extension package so the code in the repo is the same code Chrome loads.

That simplicity is intentional. The extension should stay easy to inspect, load unpacked, debug in Chrome, and package as a ZIP without needing a custom backend or app shell.

The extension lives in:

```text
extension/
```

Required files:

```text
extension/manifest.json
extension/background.js
extension/content.js
extension/popup.html
extension/popup.js
```

Validation:

```bash
npm run validate:extension
npm run lint
```

Build package:

```bash
npm run zip
```

Inspect ZIP contents:

```bash
unzip -l dist/YT_Metadata_Pro_Extension.zip
```

---

## Troubleshooting

If badges do not appear:

1. Reload the extension in `chrome://extensions/`.
2. Reload any open YouTube tabs.
3. Confirm your API key is saved in the popup.
4. Open DevTools on YouTube and look for logs beginning with:

   ```text
   [YT-Metadata-Pro]
   ```

Useful log meanings:

- `Checking visible video IDs` means the content script is running.
- `Lookup complete ... licensed=0` can still mean the extension is working.
- `Lookup failed` usually means API key, quota, or API enablement needs checking.
- No logs usually means Chrome has not injected the content script into that tab yet.

---

## Known Limitations

- Search/results pages are the tested scope for the current release.
- YouTube can change its page structure, which may require content-script selector updates.
- API key setup, YouTube Data API enablement, quota, or regional API behavior can affect lookup results.
- The extension only checks YouTube's `licensedContent` metadata signal.
- No badge means the video was not flagged by this metadata path; it does not mean the audio is safe to reuse.

---

## Privacy & Security

YT Metadata Pro keeps the workflow local and inspectable.

✅ **Local API Key Storage:** Your API key is stored in Chrome extension local storage.  
✅ **No Telemetry:** No analytics, product tracking, or crash reporting.  
✅ **No Backend:** No custom server receives your browsing data or API key.  
✅ **Simple Extension Files:** The extension is plain `manifest.json`, JavaScript, and HTML.  
❌ **No Downloading:** The extension does not download video or audio.  
❌ **No Legal Claims:** The badge is metadata triage, not rights clearance.

---

## Status

Early working prototype.

The current milestone is intentionally narrow:

> Detect visible YouTube result thumbnails and badge videos where YouTube reports `licensedContent: true`.

Tested manually with a local YouTube Data API key on YouTube search/results pages.

---

## License

YT Metadata Pro is released under the MIT License.

---

## Support

If you find YT Metadata Pro useful, consider buying me a coffee!
☕️ [Buy Me A Coffee](https://ko-fi.com/dangercharlie)
