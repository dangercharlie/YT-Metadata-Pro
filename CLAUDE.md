# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome MV3 extension that puts an **IDENTIFIED** badge on YouTube thumbnails (and under the title on the watch page) when YouTube's own page data has a music / song-credits section for that upload. It is plain JS/CSS/HTML with **no build step, no bundler, no dependencies and no minification**. The files in `extension/` are exactly what Chrome runs, and the repo is the release artifact. Keep it that way: don't add a build pipeline, npm dependencies, or transpiled code.

## Commands

```bash
npm run validate:extension   # structural/policy checks on extension/ (scripts/validate-extension-package.mjs)
npm run test:identification  # parser fixture tests (scripts/test-identification.mjs)
npm run lint                 # both of the above; this is what CI runs
npm run zip                  # lint, then build dist/YT_Metadata_Pro_Extension.zip (byte-reproducible)
node scripts/detect-identified.mjs [--hl de] <videoId> [...]   # check live videos with the shipped parser
```

There's no test runner. `test-identification.mjs` loads the real `extension/identify.js` into a `vm` sandbox (only `URL` is provided) and runs an inline `CASES` list; add a case there. Fixtures in `scripts/fixtures/` are real YouTube responses trimmed to what the parser reads — never commit untrimmed captures (they're megabytes and can contain the requester's IP). CI (`.github/workflows/validate-extension.yml`, Node 22) runs validate, test, and zip on every PR and on every push to `main`.

`npm run zip` stages a copy of `extension/` with fixed mtimes, file modes and file order, so the same source always produces a byte-identical ZIP. Published release hashes depend on this, so keep those normalisation steps if you edit the script.

To try changes for real: go to `chrome://extensions` → Developer mode → Load unpacked → `extension/`, then reload the YouTube tabs. Logs are prefixed with `[YT-Metadata-Pro]`.

## Architecture

Three pieces, no background worker:

- **`extension/identify.js`** — pure parsing, no DOM or `chrome.*`. Exposes `globalThis.YTIdentify` (`classify`, `extractData`, `parseCreditRuns`, `idFromHref`, `isShortsHref`). Loaded as a content script before `content.js` (same manifest entry, shared global) and by the Node scripts via `vm`. `classify(text, videoId)` finds `engagementPanels[].…structuredDescriptionContentRenderer`, and a video is *identified* iff some `items[].horizontalCardListRenderer.cards[]` has a `videoAttributeViewModel` (one per song; credits are in its `confirmDialogRenderer.dialogMessages` runs, labels = bold runs before a bold `": "`). It returns `null` — a failure, never cached — when there is no description panel (degraded/interstitial/bot-check), the data is for another video, or the body doesn't parse. **Never match on display text**: labels and counts are localized ("Song"/"Titel"/"曲", "1 song"/"9 曲"), which is the bug 2.1.0 fixed. Look-alikes that must stay negative: Games (`videoAttributesSectionViewModel`), chapters (`macroMarkersListItemRenderer` cards), and related-playlist `"14 songs"` badges outside the panel.
- **`extension/content.js`** — one IIFE at `document_idle` on `https://www.youtube.com/*`.
  - *Page model:* everything keys off **thumbnail links** (`THUMB_LINK`: `a#thumbnail` for search/legacy grids, `a.ytLockupViewModelContentImage` for home/sidebar lockups, `a.reel-item-endpoint` for Shorts). A `MutationObserver` (childList + `href` attributes) debounces into `sync()`, a single pass that re-reads each link's href, updates its badge and dim class, and queues lookups for visible links whose video changed. YouTube recycles nodes, so state is always derived from the current href (`linkIds` WeakMap), never stored on the node. Cost must stay O(links on page) — don't reintroduce per-cache-entry DOM scans (2.0.0 froze pages for ~400 ms every 2 s that way).
  - *Skipped:* Shorts (YouTube's `next` response has no music section for them), collections (`yt-collection-thumbnail-view-model`: playlists/mixes link to their first video), ads.
  - *Badge placement:* on the link's `yt-thumbnail-view-model` or enclosing `ytd-thumbnail`, top-left (YouTube's hover buttons are top-right). Tooltip is a single `position: fixed` element on `<body>` so thumbnail overflow can't clip it; hover and click are hit-tested page-wide (`onPointerMove`/`onClick`, capture phase) rather than bound to the badge, because on search results YouTube's inline preview player covers the thumbnail the moment the pointer arrives; a badge click copies credits and must `preventDefault` + `stopImmediatePropagation` or YouTube opens the video. Watch page: badge appended to `ytd-watch-metadata #title`.
  - *Lookups:* same-origin POST to `/youtubei/v1/next` with `hl: "en"`, falling back to `/watch?v=…&hl=en`. Only for links within `IntersectionObserver` range; queue is LIFO and drops ids that scrolled away; `MAX_CONCURRENT = 4`. Failures: up to `MAX_RETRIES` with backoff, then `gaveUp` until reload/clear; a 429 or 5 consecutive failures pauses all lookups for 5 minutes.
  - *Cache:* one `chrome.storage.local` key per video (`ytid:v:<id>` → `{state, songs?, count?, at}`), written in batches, so tabs never overwrite each other. Positives live 7 days, negatives 6 hours (checked with `isFresh` on every read); pruned and capped at `MAX_STORED_ENTRIES` on load. `chrome.storage.onChanged` keeps tabs in sync and handles the popup's clear (removed keys → re-check visible). The legacy `ytid:cache:v1` key is deleted on load.
  - Answers `{type: "pageStats"}` messages for the popup.
- **`extension/popup.*`** — reads/writes storage directly (`ytid:settings` = `{enabled, dimIdentified}`; clearing removes `ytid:v:*` keys) and asks the active tab for `pageStats` via `chrome.tabs.sendMessage`, which needs no `tabs` permission.

### Invariants enforced by the validator

`validate-extension-package.mjs` fails the build if any of these break:
- The only permission is `storage` (no others, no `optional_permissions`), and there are **no `host_permissions`**. It would go unused because the fetches are same-origin, and the Chrome Web Store treats unused permissions as a single-purpose violation.
- Content script match patterns are exactly `youtube.com` patterns, and `identify.js` loads before `content.js` in the same entry.
- No extension script contains `licensedContent` (the retired v1 signal; it means "partner channel," not "identified") or `eval` / `new Function` / `importScripts`.
- `identify.js` mentions `videoAttributeViewModel` and `dialogMessages`; `content.js` contains `/youtubei/v1/next` and the `/watch?v=` fallback. These are plain string checks.

## Product constraints

- The extension shows whether YouTube has identified the music in an upload — nothing more. Don't frame it (in the UI or docs) around whether a video is safe to use or reuse, legal rights, or claims, and don't add "what no badge means" disclaimers; that isn't its purpose and is misleading. The popup's page counts already show what's been checked. Identification matches recordings, not songs.
- The extension is best-effort against an undocumented endpoint. It has to fail quietly and must never break YouTube pages.
- No telemetry, no backend, no API key.
- Releases go out from GitHub as a ZIP (see `docs/DISTRIBUTION.md`). Bump `version` in both `manifest.json` and `package.json`.
- The tracked `scripts/` should stay limited to the validator, the fixture test (plus `scripts/fixtures/`) and the detection CLI. Some local files are kept out of git via `.git/info/exclude`. Never commit untracked or ignored files you didn't create, and stage files by name instead of using `git add -A`/`git add .`.
