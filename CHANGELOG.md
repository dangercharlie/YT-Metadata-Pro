# Changelog

## 2.0.0 — the working release

The first version of this extension that does what it claims to do. It supersedes
`v1.0.0`, which has been retired.

### The signal

v1 read `contentDetails.licensedContent` from the YouTube Data API and badged matches with
`MUSIC`. That field means *"uploaded to a channel linked to a YouTube content partner"* — a
property of the channel, not the audio — so it did not answer the question the extension
existed to answer.

Measured against the live API across 499 videos, the v1 badge:

- fired on **66% non-music** content (news, sport, education)
- **missed 86%** of vinyl-rip and remix results (29/200)
- returned `false` on four vinyl rips that YouTube's own song-credits panel had matched,
  with artist, album and writers listed

v2 reads YouTube's **song-credits / music panel** — the signal that actually appears when a
recording has been identified as a registered work.

### User-facing changes

- Badge is now **`IDENTIFIED`** instead of `MUSIC`, with the matched song, artist and album
  in the tooltip.
- **No API key required.** v1 required every user to create a Google Cloud project and paste a
  YouTube Data API v3 key. That requirement is gone, along with the key-storage UI.
- Permissions reduced to a single `storage`. `host_permissions` was removed as unused — the
  content script fetches same-origin, verified both ways against live YouTube.

### Fixes to make it functional as intended

| Problem in v1 | Fix in v2 |
|---|---|
| Stale badge left on a thumbnail YouTube had recycled for a different video | Badges reconciled against the video a node currently shows |
| Recycled thumbnails never re-checked; transient errors blacklisted a video ID permanently | Bounded retry with backoff; failures are never cached |
| `href*="/watch?v=ID"` substring match could select the wrong video | Video IDs parsed and compared exactly |
| Only `ytd-thumbnail` was scanned | Covers `yt-thumbnail-view-model`, `yt-lockup-view-model` and Shorts |
| A missing API key produced no badges and no diagnostic | No key needed; failures surface in the console |

### Reliability

- Two independent retrieval paths: the innertube `next` endpoint, then the watch-page HTML.
- Client version scraped from the page rather than hard-coded — plausible version strings
  from 2019–2024 all still work.
- Failures distinguished from genuine negatives, and never cached.
- Verified stable at 20 concurrent requests and across 17 regions.

### Added

- `AUDIT.md` — investigation of the v1 signal, with reproduced bugs.
- `FEASIBILITY.md` — measured comparison of candidate signals, plus release-risk analysis.
- `DISTRIBUTION.md` — Chrome Web Store permissions and GitHub release guidance.
- `scripts/detect-identified.mjs` — check any video ID from the command line.
- `scripts/test-identification.mjs` — parser fixture tests (`npm run test:identification`).

### Known limitations

- Reads an undocumented YouTube endpoint. Best-effort; it fails quietly if YouTube changes it.
- No badge means YouTube did not surface an identification — not that the audio is safe.
- Content ID matches recordings, not songs: an official release may be identified while a
  vinyl pressing or B-side of the same track is not.

---

## 1.0.0 — retired

The first attempt. Badged YouTube search results with a green `MUSIC` label based on
`contentDetails.licensedContent`, and required a user-supplied YouTube Data API v3 key.

The release has been withdrawn: it did not flag identified uploads and produced misleading
labels on non-music content. The source remains archived under
`archive/extension-v1-licensed-content/` for reference. See `AUDIT.md` for the full analysis.
