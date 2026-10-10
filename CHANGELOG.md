# Changelog

## 2.1.0 — unreleased

Checked end to end against live YouTube (October 2026). Detection now works in every display
language, the extension no longer slows YouTube down as its cache grows, and retries really
are bounded.

### Fixes

- **Detection works in every language.** v2.0.0 matched English labels ("Song", "1 song"), so
  in any other YouTube UI language it found *no* identifications — 0 of 36 identified responses
  across German, French, Spanish, Japanese and Portuguese — and cached each as "not identified"
  for 6 hours. Detection now reads the structure of YouTube's music section, which is the
  same in every language, and requests English responses for consistency.
- **Songs with an empty credits dialog** (e.g. some official releases) are now detected.
- **Unusable responses aren't cached as "not identified".** A degraded response, a response
  for the wrong video, or a bot check is treated as a failure and retried later.
- **Retries are actually bounded.** v2.0.0 reset its retry counter on every attempt, so a
  failing video was re-fetched every few seconds for as long as the tab was open. Now: at most
  three attempts with backoff, and all lookups pause for 5 minutes if YouTube rate-limits.
- **No more slowdown as the cache grows.** v2.0.0 rescanned every link on the page once per
  cached identification every 2 seconds — measured at a 400 ms freeze every 2 s with ~600
  cached results. Pages are now re-checked only when YouTube changes them, in a single pass.
- The page's client version is read once instead of serialising the whole page per lookup.
- **Badges sit on the thumbnail** in the watch-page sidebar and on search playlists (they were
  drawn over the title), are top-left so they no longer cover YouTube's hover buttons, and no
  longer duplicate on Shorts.
- **Wrong badges no longer linger** for up to 2 seconds on recycled results after navigating.
- **Playlists, mixes and ads are skipped** instead of being badged by their first video.
  **Shorts are skipped**: YouTube doesn't expose identification for them, so they used to be
  cached as "not identified".
- **"Clear cache & re-check" works** with YouTube tabs open; previously any open tab wrote its
  old results straight back. Several YouTube tabs no longer overwrite each other's results.
- Expired results are re-checked in long-lived tabs, and storage is pruned and capped.
- Credit text is shown unescaped (`7" Mix`, not `7\" Mix`).

### New

- Badge on the watch page, under the video title.
- Tooltip lists every matched song with artist, album and writers; the badge shows a count
  when there are several. Click a badge to copy `Artist – Song`.
- Popup: what's been found on the current page (identified / not identified / not checked
  yet / couldn't check), a **Show badges** switch, and **Dim identified results** to make the
  uploads YouTube hasn't matched stand out.
- `detect-identified.mjs --hl <lang>` to check how a video looks in another UI language.

### Internal

- Parsing moved to `extension/identify.js`, which the tests and CLI load directly, so they
  test the shipped code instead of a copy. Fixtures are trimmed real responses.
- The background service worker is gone; the popup reads storage directly.
- Content script limited to `https://www.youtube.com/*`.

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

- `docs/DISTRIBUTION.md` — Chrome Web Store permissions and GitHub release guidance.
- `scripts/detect-identified.mjs` — check any video ID from the command line.
- `scripts/test-identification.mjs` — parser fixture tests (`npm run test:identification`).

### Known limitations

- Reads an undocumented YouTube endpoint. Best-effort; it fails quietly if YouTube changes it.
- Content ID matches recordings, not songs: an official release may be identified while a
  vinyl pressing or B-side of the same track is not.

---

## 1.0.0 — retired

The first attempt. Badged YouTube search results with a green `MUSIC` label based on
`contentDetails.licensedContent`, and required a user-supplied YouTube Data API v3 key.

The release has been withdrawn: it did not flag identified uploads and produced misleading
labels on non-music content. The source remains browsable at the
[`v1.0.0` tag](https://github.com/dangercharlie/YT-Metadata-Pro/tree/v1.0.0) for reference
only. **Do not install it:** the README in that tag predates the withdrawal, and loading that
build produces misleading labels.
