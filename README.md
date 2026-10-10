<p align="center">
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat&logo=googlechrome&logoColor=white" alt="Chrome Extension" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro/releases/latest"><img src="https://img.shields.io/github/v/release/dangercharlie/YT-Metadata-Pro?style=flat&label=Release" alt="Latest release" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Telemetry-None-238636?style=flat" alt="Telemetry" /></a>
  <br/>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro/actions/workflows/validate-extension.yml"><img src="https://github.com/dangercharlie/YT-Metadata-Pro/actions/workflows/validate-extension.yml/badge.svg" alt="Validate Extension workflow" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/API_Key-Not_Required-238636?style=flat&logo=lock&logoColor=white" alt="No API key required" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Permissions-storage_only-238636?style=flat" alt="Minimal permissions" /></a>
  <a href="https://github.com/dangercharlie/YT-Metadata-Pro"><img src="https://img.shields.io/badge/Status-Best_Effort-007EC6?style=flat" alt="Best effort" /></a>
</p>

# YT Metadata Pro

**YT Metadata Pro** is a lightweight Chrome extension that saves you from opening every
YouTube result just to find out whether YouTube has already identified the music in it.

It badges YouTube search results with a green **IDENTIFIED** label when YouTube's own
metadata shows the upload has been matched to a registered musical work — including
re-uploads, vinyl rips and remixes that are mixed in with already-identified results.

<p align="center">
  <img src="screenshots/search-results.png" width="760" alt="YouTube search results for King Tubby dubplates: a Triston Palma pre-release dubplate with no badge above a King Tubby's Sound System dubplate showcase badged IDENTIFIED with 2 songs." />
</p>

<p align="center">
  <em>Live capture: a King Tubby's pre-release dubplate YouTube hasn't matched, above a dubplate showcase it has.</em>
</p>

---

## Why?

If you upload or curate music on YouTube, the question that matters is not "is this labelled
as music?" but:

> Has YouTube already identified this recording as a registered work?

Official releases are usually matched. The interesting cases are the ones that are *not* —
a vinyl pressing, a 12" B-side, a dub, a remix — sitting in the same results list as the
official version. This extension puts that answer on the thumbnail so you can see it before
you click.

---

## What It Does

- Badges search results, the home feed and the watch-page sidebar with a green **IDENTIFIED**
  label when YouTube's own page data carries a **music / song-credits section** for the upload
- Also badges the video you're watching, under its title
- Hover a badge to see every matched song — title, artist, album and writers; click it to copy
  `Artist – Song` to the clipboard
- **Dim identified results** (popup toggle) so the uploads YouTube *hasn't* matched stand out
- Popup shows what's been found on the current page, and lets you pause badges or clear the cache
- Works in any YouTube display language
- Caches results locally so repeat lookups are rare
- Requires **no API key** and **no account**

<p align="center">
  <img src="screenshots/tooltip.png" width="760" alt="Hovering an IDENTIFIED badge on King Tubby - Dubbing With The Observer [1975] lists the 10 songs YouTube matched, with artists and albums." />
  <br/><em>Hover a badge to see what YouTube matched; click to copy it.</em>
</p>

<p align="center">
  <img src="screenshots/dim-identified.png" width="760" alt="The same search with Dim identified results turned on: the matched upload is faded and the unmatched dubplate stands out." />
  <br/><em>Dim identified results: the uploads YouTube hasn't matched stand out.</em>
</p>

<p align="center">
  <img src="screenshots/watch-page.png" width="520" alt="Watch page for King Tubby - Dubbing With The Observer [1975] with an IDENTIFIED 10 badge under the title." />
  &nbsp;
  <img src="screenshots/popup.png" width="230" alt="Extension popup showing counts for the current page (identified, not identified, not checked yet, couldn't check), settings toggles and the cache." />
  <br/><em>The watch page badge, and the popup with counts for the current page.</em>
</p>

---

## What It Does Not Do

- It does not download videos or audio
- It does not bypass YouTube limits, permissions, or platform controls
- It does not read Content ID data directly — that is only available to YouTube's partners

---

## How it works

YouTube already knows which uploads contain music it has identified as a registered work —
it just buries that answer in a panel you only see after opening the video. This extension
surfaces it on the thumbnail instead.

When a result scrolls into view, the extension asks YouTube's own page data whether that
upload has a **Music** section in its description — the list of songs with a "Song credits"
dialog that YouTube shows once it has matched the audio. If it does, the thumbnail gets a green
**IDENTIFIED** badge (with a count when there are several songs), and hovering it lists them.

One detail worth knowing: **it matches recordings, not songs.** The official release of a
track is often identified while a vinyl pressing, B-side, dub or remix of the *same song* is
not. In practice that is usually the distinction worth knowing — and it is why this exists.

<p align="center">
  <img src="screenshots/identified-badge-example.png" width="700" alt="Two vinyl rips of the same Daft Punk track, both badged IDENTIFIED." />
  <br/><em>Two vinyl rips of the same Daft Punk track, both matched by YouTube.</em>
</p>

Results are cached locally, lookups are limited to videos on (or about to scroll onto) the
screen, and there is no API key, no account, and no server.

---

## A note on v1

An earlier version (v1, tagged `v1.0.0`, since retired) badged uploads using the YouTube Data
API field `contentDetails.licensedContent`. That field does not mean "this audio has been
identified" — it means *"uploaded to a channel linked to a YouTube content partner"*, a
property of the channel rather than the audio. In practice it flagged a lot of non-music
content and missed most vinyl rips. It also required every user to supply their own API key.

This version reads YouTube's own identification instead, and needs no key. The v1 release has
been withdrawn; its source remains browsable at the
[`v1.0.0` tag](https://github.com/dangercharlie/YT-Metadata-Pro/tree/v1.0.0) for reference only.
**Do not install it** — the README in that tag predates the withdrawal, and loading that build
produces misleading labels on non-music videos.

<details>
<summary>What changed, and the evidence behind it</summary>

The retired field was measured against the live API across 499 videos. It fired on **66%
non-music** content — `MUSIC` appeared on news, sport and education videos — while **missing
86%** of vinyl-rip and remix results. It also returned `false` on four vinyl rips that
YouTube's own song-credits panel had already matched.

Replacing the signal also meant fixing the plumbing around it:

| Problem in v1 | Fix |
|---|---|
| Stale badges when YouTube reused a thumbnail for a different video | Badges reconciled against the video a node currently shows |
| Recycled thumbnails never re-checked; a transient error blacklisted a video forever | Bounded retry with backoff; failures are never cached |
| Substring URL matching could badge the wrong video | Video IDs parsed and compared exactly |
| Only one thumbnail element type was scanned | Covers the newer view-model components and Shorts |
| A missing API key gave no badges and no explanation | No key needed at all |

</details>

---

## Installation

This extension is distributed **from GitHub**, not the Chrome Web Store. That means you install
it in developer mode, and Chrome will show a developer-mode warning. That is expected for any
extension installed outside the Store.

1. Download the latest release ZIP and extract it, or clone this repo.
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `extension/` folder.
6. Reload any open YouTube tabs.

There is no API key to configure.

> **Updates are manual.** Unpacked extensions do not auto-update. Re-download or `git pull`
> to get new versions.

---

## Verify the build

The extension is plain JavaScript, CSS and HTML. There is **no build step, no bundler, no
dependencies and no minification** — the files in the repo are the files Chrome runs, so you
can read everything that executes.

```bash
npm run lint          # validates the package + runs parser fixture tests
npm run zip           # builds dist/YT_Metadata_Pro_Extension.zip
shasum -a 256 dist/YT_Metadata_Pro_Extension.zip
```

---

## Privacy

- **No telemetry.** No analytics, tracking, or crash reporting.
- **No backend.** Nothing is sent to any server operated by this project.
- **No API key.** Nothing to configure, nothing to leak.
- **One permission:** `storage`, used for the local identification cache.
- **One site:** the content script runs only on `www.youtube.com`.

The only network requests are to YouTube itself, from your own browser, for public page data.

---

## Permissions

```json
"permissions": ["storage"],
"content_scripts": [{ "matches": ["https://www.youtube.com/*"] }]
```

No `host_permissions`, no `tabs`, no `<all_urls>`. The extension reads YouTube data using
same-origin requests, so it does not need broad host access.

---

## Known Limitations

- **Best-effort.** The extension reads a YouTube endpoint that is not a documented public API.
  It can change without notice. If it stops working, the extension fails quietly — it will not
  break YouTube pages.
- **Content ID matches recordings, not songs.** The official version of a track is often
  identified while a vinyl pressing, B-side or remix of the same song is not. That is expected
  behaviour, not a bug — it is usually the distinction you are looking for.
- **Shorts aren't badged.** YouTube doesn't include the music section for Shorts, so there is
  nothing to read. Playlists, mixes and ads are skipped too.
- **Desktop site only.** The mobile site (`m.youtube.com`) and YouTube Music aren't covered.
- If YouTube starts rate-limiting lookups, the extension pauses them for a few minutes rather
  than retrying, and the popup says so.
- Identifications are cached locally for up to 7 days, "not identified" results for 6 hours.

---

## Troubleshooting

If badges do not appear:

1. Reload the extension in `chrome://extensions/`.
2. Reload any open YouTube tabs.
3. Open the extension popup: the **This page** counts show whether videos are being checked,
   and whether lookups failed or are paused.
4. Open DevTools on YouTube and look for logs beginning with `[YT-Metadata-Pro]`.
5. Use **Clear cache & re-check** in the popup — open YouTube tabs re-check what's on screen.

---

## Development

The extension lives in `extension/` and is plain MV3 — no build step, no bundler, no
dependencies:

```text
extension/manifest.json
extension/identify.js    # parses YouTube's response (pure; also used by the tests and CLI)
extension/content.js     # finds thumbnails, runs lookups, caches, renders badges
extension/popup.html     # page stats, settings, cache
extension/popup.js
extension/badge.css
```

Check any video from the command line:

```bash
node scripts/detect-identified.mjs dQw4w9WgXcQ
node scripts/detect-identified.mjs --hl de dQw4w9WgXcQ   # as a German-language user would see it
```

```bash
npm run lint     # validate package + parser fixture tests
npm run zip      # build dist/YT_Metadata_Pro_Extension.zip
```

Packaging and release notes: [`docs/DISTRIBUTION.md`](docs/DISTRIBUTION.md)

---

## License

Released under the MIT License.

---

## Support

If you find YT Metadata Pro useful, consider buying me a coffee!
☕️ [Buy Me A Coffee](https://ko-fi.com/dangercharlie)
