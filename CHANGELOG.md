# Changelog

## 2.0.0 — identified-upload signal

**Breaking change.** The badge now means something different, because the previous signal
turned out not to mean what the extension claimed.

### Changed

- **Signal replaced.** The extension no longer reads the YouTube Data API field
  `contentDetails.licensedContent`. It now reads YouTube's own **song-credits / music panel**,
  which is what actually appears when YouTube has identified an upload as a registered work.
- **Badge text** changed from `MUSIC` to `IDENTIFIED`. The tooltip shows the matched song,
  artist and album.
- **No API key required.** The old design needed every user to create a Google Cloud project
  and paste a YouTube Data API v3 key. That is gone, along with the key-storage UI.
- **`host_permissions` removed.** The content script fetches same-origin, so the permission was
  unused. Permissions are now just `storage`.
- **Packaging.** The extension ships from `extension/`. v1 is archived under
  `archive/extension-v1-licensed-content/` for reference only.

### Why

`licensedContent` means *"uploaded to a channel linked to a YouTube content partner"* — a
property of the channel, not of the audio. Measured against the live API on 499 videos:

- **66%** of flagged videos were not in the Music category — the `MUSIC` badge appeared on
  news, sports and education videos.
- **86%** of vinyl-rip and remix results were not flagged (29/200).
- Four vinyl rips that showed YouTube's own "Song credits" panel — with artist, album and
  writers — all returned `licensedContent: false`.

In effect the old badge indicated "large publisher channel", not "identified music".

### Fixed

Bugs reproduced in v1 and fixed here:

- **Stale badges.** YouTube recycles list nodes while scrolling; v1 left a badge attached to a
  node that had been reused for a different video. Badges are now reconciled against the video
  a node currently shows.
- **Permanently missed badges.** A recycled node was never re-checked, and a transient API
  failure blacklisted the video ID forever. Both now retry with bounded backoff.
- **Selector collision.** `href*="/watch?v=ID"` is an unanchored substring match; video IDs are
  now parsed and compared exactly.
- **Coverage.** v1 only scanned `ytd-thumbnail`. Now also covers `yt-thumbnail-view-model`,
  `yt-lockup-view-model` and Shorts (`/shorts/<id>`).
- **Silent failure.** A missing API key produced no badges and no explanation.

### Reliability

- Two independent retrieval paths: the innertube `next` endpoint, then the watch-page HTML.
- Client version is scraped from the page rather than hard-coded.
- Failures are distinguished from genuine negatives, and are never cached.
- Verified stable at 20 concurrent requests and across 17 regions.

### Added

- `AUDIT.md` — investigation of the v1 signal, with reproduced bugs.
- `FEASIBILITY.md` — measured comparison of candidate signals and the release-risk analysis.
- `DISTRIBUTION.md` — Chrome Web Store permissions and GitHub release guidance.
- `scripts/detect-identified.mjs` — check any video ID from the command line.
- `scripts/test-identification.mjs` — parser fixture tests (`npm run test:identification`).

### Known limitations

- Reads an undocumented YouTube endpoint. Best-effort; it fails quietly if YouTube changes it.
- No badge means YouTube did not surface an identification — not that the audio is safe.
- Content ID matches recordings, not songs: an official version may be identified while a vinyl
  pressing or B-side of the same track is not.

---

## 1.0.0

- Initial release. Badged YouTube search results with a green `MUSIC` label based on
  `contentDetails.licensedContent`.
- Required a user-supplied YouTube Data API v3 key.
