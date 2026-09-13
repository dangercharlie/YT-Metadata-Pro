# YT Metadata Pro — Code & Correctness Audit

Date: 2026-09-12
Commit audited: `898d076` (`Add MIT license`, 2026-05-11)
Scope: `extension/`, `scripts/`, `README.md`, workflow

Empirical re-verification: 2026-09-12, against the live YouTube Data API v3 with a real key
(499 videos sampled; key never written to the repo — read from `YT_API_KEY`).

> Note on variance: `search.list` results shift between runs, so exact counts vary a few
> percent run-to-run. Two runs of the same script gave Music-category licensed rates of
> 61.7% and 61.4%, and non-music false-positive counts of 138 and 143. The conclusion is
> stable; the precise numbers are not.

---

## TL;DR

The extension is mechanically sound (it loads, validates, and calls the API correctly),
but **it does not do the thing the product is described as doing.**

The one signal it reads — `contentDetails.licensedContent` — is **not** "this upload was
audio-fingerprinted by Content ID." It means *"this video was uploaded to a channel linked
to a YouTube content partner."* That is a channel-level property, not a claim-level one.
The two overlap but are not the same, and they diverge in exactly the cases this tool exists
for (vinyl rips, remixes, re-uploads of copyrighted tracks).

**Measured, not inferred:** across 499 sampled videos, `licensedContent` was `true` for
**84% of *news*** videos, 92% of *education*, and 82% of *entertainment* — while only 62% of
*categoryId 10 = Music* videos were flagged. Of 209 flagged videos, **138 (66%) were not in
the Music category at all**, so the badge would print `MUSIC` on news reports, sports
highlights and film clips. It is close to a "this channel is a big publisher" flag, not a
"this contains recognized music" flag.

On top of that, the DOM layer has three reproducible bugs that cause badges to appear on the
**wrong** videos and to be **permanently missed** on others.

The promoted README screenshot is itself a counterexample: it shows a `MUSIC` badge on
`NqdX0wEJU0o` ("T-Pain - Chopped N Skrewed [HQ]", Giannini Urban), whose live
`licensedContent` is **`false`** — so the shipped code would *not* produce the badge shown in
the screenshot.

Severity summary:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | `licensedContent` is not Content ID; "MUSIC" badge mislabels content | **Critical (product)** | Verified against Google docs + SO **+ live API (499 videos)** |
| 1b | README screenshot badges a video whose `licensedContent` is `false` | **Medium (docs)** | Verified live: `NqdX0wEJU0o` |
| 2 | DOM node recycling → stale badge on a different, unlicensed video | **High** | Reproduced headlessly |
| 3 | DOM node recycling → licensed video never checked (permanent miss) | **High** | Reproduced headlessly |
| 4 | Transient API failure permanently blacklists those video IDs | **High** | Reproduced headlessly |
| 5 | Missing API key returns silent empty success, no user-facing signal | **Medium** | Code trace |
| 6 | `href*=` substring selector can match the wrong video | **Low / latent** | Reproduced headlessly |
| 7 | Channel/browse pages use `yt-lockup-view-model`, never scanned | **Medium** | Verified in live DOM |
| 8 | Shorts are never scanned (`/shorts/` has no `?v=`) | **Low** | Verified in live DOM |
| 9 | Validator asserts the buggy strings, locking in the mislabel | **Low** | Code trace |
| 10 | Version drift (`1.0` vs `1.0.0`); `lint` is an alias, not a linter | **Trivial** | Code trace |

---

## 1. Critical: `licensedContent` does not mean what the badge claims

### What the code does

`extension/background.js:36`

```js
if (item?.contentDetails?.licensedContent === true) {
    licensedIds.push(item.id);
}
```

`extension/content.js:30` then renders a green badge whose text is literally `MUSIC`.

### What the field actually means

From the official [`videos` resource reference](https://developers.google.com/youtube/v3/docs/videos):

> `contentDetails.licensedContent` — **Indicates whether the video represents licensed
> content, which means that the content was uploaded to a channel linked to a YouTube
> content partner and then claimed by that partner.**

Three consequences, all of which break the product premise. All three are confirmed with live
API calls (reproduce with `YT_API_KEY=... node scripts/probe-licensed-content.mjs`).

**(a) It is a property of the *uploading channel*, not of the *audio*.**

A normal user who re-uploads a copyrighted track — the exact case this tool is meant to
surface — is not a "content partner," so the field is typically `false` even when Content ID
has already claimed the upload. This is documented in the wild:
[a developer uploaded one claimed and one unclaimed video and *both* returned `licensedContent: false`](https://stackoverflow.com/questions/54917219/use-youtube-api-v3-check-the-video-copyright-whether-is-claimed-by-partner-but-l).

Live example from the README's own screenshot query, "chopped n skrewed" — the vinyl/rip
-style uploads are exactly the ones *not* flagged:

```
  licensed cat channel                 title
  BADGE    10  TPainVEVO               T-Pain - Chopped N Skrewed (Official Video)
    -      10  Giannini Urban          T-Pain - Chopped N Skrewed [HQ]        <-- README screenshot
  BADGE    22  RapHype                 T-Pain - Chopped N Skrewed (Lyrics)
    -      22  Slowed Down RNB         T-Pain ft Ludacris - Chopped N Skrewed (Slowed)
    -      10  tpaindarapper           T-pain Ft. R.kelly- Chopped & Screwed (Remix)
    -      22  The Drobitussin         T-Pain feat. Ludacris - Chopped N Skrewed (screwed)
  BADGE    10  T-Pain - Topic          Chopped N Skrewed (Instrumental)
    -      10  Liquid Courage Karaoke  T-Pain, Ludacris - Chopped N Skrewed [KARAOKE]
```

In other words: **the tool is biased toward big publisher channels and away from the UGC
re-uploads/remixes you care about, and there is no flag in the public Data API that exposes
the Content ID claim itself.** The [Content ID API](https://developers.google.com/youtube/partner)
is restricted to onboarded YouTube partners/content owners — a personal API key cannot read claims.

**(b) It fires far more often on non-music than on music. This is the mislabelling.**

Sampled 300 videos across 12 mixed queries (`scripts/probe-licensed-content.mjs`), plus 199
from deliberately obscure queries. `licensedContent` by category:

```
category                    n  licensed=true
Music (10)                115     71 (61.7%)
News & Politics (25)       18     18 (100.0%)   <-- badge says MUSIC
Education (27)             26     24 ( 92.3%)   <-- badge says MUSIC
Science & Technology (28)  13     12 ( 92.3%)   <-- badge says MUSIC
Entertainment (24)         28     23 ( 82.1%)   <-- badge says MUSIC
Howto & Style (26)          9      7 ( 77.8%)   <-- badge says MUSIC
Film & Animation (1)       19     13 ( 68.4%)   <-- badge says MUSIC
Sports (17)                28     17 ( 60.7%)   <-- badge says MUSIC
People & Blogs (22)        39     23 ( 59.0%)
```

- Of 209 flagged videos, **138 (66%) were not in the Music category** — the green badge would
  print `MUSIC` on `ABC News`, `NBA` game highlights, `Kosmo DOC`, `Movieclips`, etc.
- Conversely **44 of 115 Music-category videos were *not* flagged** — missed.

This is also the sampling-bias-resistant part: the pattern held on obscure queries
(199 videos, 69% `true`), so it is not an artefact of searching for famous songs. In effect
`licensedContent` behaves like *"this channel is a large publisher"* more than
*"this video contains recognized music."*

**(c) It fires on copyright-free music.**

[NoCopyrightSounds videos return `licensedContent: true`](https://stackoverflow.com/questions/47604389/how-to-find-out-whether-a-video-is-copyright-protected-youtube-api-v3)
— confirmed live for `TW9d8vYrVFQ` (`NoCopyrightSounds`, `licensedContent: true`) — even
though they are explicitly free to use. So the badge is neither necessary nor sufficient for
"this will trigger a claim."

**(d) DECISIVE: the exact target case is missed, and we can prove YouTube identified it.**

This is the answer to "does it still work for vinyl rips / remixes?". I sampled 200 videos
from vinyl/remix-specific queries (`vinyl rip`, `12 inch remix`, `bootleg remix`, `rare groove
vinyl rip`, …):

```
flagged (badge shown)                    :  29/200 = 14%
NOT flagged (click still required)        : 171/200 = 86%
```

So **86% of the target content gets no badge.** More importantly, we can prove the misses are
false negatives rather than "no music here": several unflagged rips expose YouTube's own
**"Song credits"** panel, which is exactly the fingerprint/registered-work identification the
tool is meant to surface.

```
video          licensedContent   YouTube "Song credits" panel
6tTQ_tThE2Q    false            Song: Sultans Of Swing | Artist: Dire Straits | Writers: Mark Knopfler
3LZgBT11ORg    false            Song: Blue Monday (Instrumental Outtake) | Artist: New Order
pjDxZ1bas44    false            Song: Money For Nothing (Single Edit / Remastered 2022) | Artist: Dire Straits
vmhE9wW4rAA    false            Song: Smooth Operator (Single Version) | Artist: Sade | Writers: ...
```

Read that table carefully: **YouTube positively identified the registered work** (artist,
album, writers) on all four — and `licensedContent` is `false` on all four. The badge stays
dark. These are precisely the uploads the user built the tool to find.

Meanwhile the flagged 14% in that sample were mostly official `- Topic` / label uploads
(`Altra Moda Music`, `Kool & The Gang - Topic`, `Mondo Music - Topic`), i.e. the releases that
were *already* obvious from the channel name — the badge adds little there.

**Verdict for the original intent: no.** It does not reliably flag audio-fingerprinted
uploads, and it fails hardest on vinyl rips and remixes. See the Q&A section at the end.

### Why the docs already half-admit this

`README.md:63` correctly says it "does not perform audio fingerprinting," and `README.md:219`
scopes the claim to "YouTube's `licensedContent` metadata signal." But the headline claims are
stronger than the mechanism:

- `README.md:15` — "check whether YouTube already marks it as licensed content" (fair), but
- `README.md:17` and `README.md:21` — "badge likely music matches" / "check YouTube metadata → badge likely music matches" (overclaimed), and
- the original landing copy in `src/App.tsx` (commit `2bbc29c`, line 295) said the quiet part
  out loud: *"YouTube identifies music in uploads through Content ID, but this information is
  hidden deep inside video descriptions."* That sentence is the bug, in prose form.

### The honest options (with what the live API actually supports)

I tested the plausible replacement signals. Results:

| Signal | Available via personal API key? | Verdict |
|---|---|---|
| `contentDetails.licensedContent` | Yes | Already used. Means "partner channel", not "Content ID". |
| `snippet.categoryId == 10` | Yes | **Useful but incomplete** — it is the true "this is filed as Music", but many reuploads file under 22/24, so it misses them (44/115 music-category misses were mostly category 22 reuploads). |
| `snippet.description` attribution | Yes | **Not populated live.** I checked 9 VEVO/Topic/OMS uploads: zero contained "Licensed to YouTube by" or "Provided to YouTube by" in the *API* description, even when the watch page shows it. The API `description` is only the uploader's text. |
| `topicDetails.topicCategories` | Yes | **Near-useless here** — only 1 of 200 sampled videos returned `wiki/Music`, and 0 of the `licensedContent: true` ones. Do not rely on it. |
| `status.license` | Yes | Returns `"youtube"` vs `"creativeCommon"` — that is the CC licence, not Content ID. |
| Content ID claims (real) | **No** | Partner-only [Content ID API](https://developers.google.com/youtube/partner). |
| Watch-page "Music in this video" / "Licensed to YouTube by" block + `- Topic` channels | Scraped, not API | **Best match to the stated goal.** The block is rendered lazily (it did not appear in a headless dump, only in `ytInitialData` for music-heavy pages), so it is fragile, but it is the signal that actually corresponds to fingerprinting/claims. |

Recommended, in order:

1. **Reframe the signal** (safest, no new endpoints): rename the badge from `MUSIC` to
   something true, e.g. `LICENSED` / `PARTNER`, and describe it as *"uploaded to a YouTube
   partner channel"*. Your measured data shows this is what it really tracks. Keeps the tool
   honest and still useful as a coarse "big publisher" triage signal.
2. **Add `categoryId == 10` as a second, independent signal** so you can distinguish
   "Music category" from "partner channel" — e.g. two badge styles. This is free (already in
   `part=snippet`) and directly addresses the 66% non-music false-positive rate.
3. **For the vinyl/remix case specifically**, accept that no API-key-accessible field answers
   "is this audio fingerprinted". The closest observable proxy is the watch-page attribution
   block / `- Topic` channel, plus checking whether the uploader's channel is a reposter.
   Document that limitation plainly.

Changing the badge text is a product decision, so it is called out here rather than
silently changed.

---

## 2. High: DOM node recycling leaves a stale badge on the wrong video

`extension/content.js:11-13` marks a thumbnail once:

```js
if (node.hasAttribute('data-music-badge-applied')) return;
node.setAttribute('data-music-badge-applied', 'true');
```

and never clears it. YouTube recycles list/cell elements as you scroll
(this is standard Polymer `iron-list`/virtual-scroller behaviour; element properties are not
reset on recycle). When a badged `<ytd-thumbnail>` is reused for a different video:

- the `data-music-badge-applied` flag persists, and
- `createBadge()` refuses to act again, but the **old badge DOM node is still in the element**.

Result: the reused thumbnail shows a `MUSIC` badge for a video that was never reported as
licensed. **This directly produces false labels.**

Reproduced headlessly (`content.js` loaded unmodified against a stubbed `chrome.runtime` and
`IntersectionObserver`): video `AAAAAAAAAAA` is licensed and badged; the same node is then
reused for unlicensed `CCCCCCCCCCC`:

```
RESULT|FETCH:AAAAAAAAAAA,BBBBBBBBBBB|PHASE1 licensedA=YES licensedB=no
      |PHASE2 after-recycle nodeA now=/watch?v=CCCCCCCCCCC staleBADGE=YES
```

---

## 3. High: recycling also causes permanent missed badges

`extension/content.js:104-108` marks nodes with `data-io-attached` and
`observer.unobserve()`s them on first intersection. If that node is later recycled for a
*different* video, it is never re-observed and its video ID is never queued.

Reproduced: node first rendered for unlicensed `BBBBBBBBBBB`, then reused for licensed
`DDDDDDDDDDD`:

```
RESULT|FETCH:BBBBBBBBBBB|nodeB-now=/watch?v=DDDDDDDDDDD badge=no|shorts-badge=no
```

Only one fetch ever happened; the licensed video was never looked up.

**Fix shape:** key state by *video ID per node*, not by a permanent node attribute. Store the
video ID a node currently represents, detect when it changes, clear stale badges, and
re-evaluate. A `MutationObserver` on `href` changes plus a periodic reconcile sweep handles
this without relying on one-shot flags.

---

## 4. High: a transient API failure permanently blacklists IDs

`extension/content.js:91-93` records the ID as "scanned" *before* the answer is known:

```js
} else if (!scannedVideoIds.has(videoId)) {
    scannedVideoIds.add(videoId);
    batchQueue.push(videoId);
}
```

and `extension/content.js:49-52` aborts the whole batch on error:

```js
if (response.error) { console.warn(...); return; }
```

`scannedVideoIds` is never pruned. So any quota blip, expired key, or network hiccup means
those video IDs are never retried for the lifetime of the page — even after the key is fixed
or quota resets. Reproduced with one injected error followed by success:

```
RESULT|FETCH:EEEEEEEEEEE|after-transient-error badge=NO
```

**Fix shape:** mark pending, not scanned; requeue on error with bounded backoff; only mark as
resolved once a definitive answer (or a definitive "not found") returns.

---

## 5. Medium: missing API key is a silent no-op

`extension/background.js:6-10` returns `{ licensedIds: [] }` with **no `error` field** when no
key is stored. `content.js` therefore hits neither the error branch nor any diagnostic, and
logs nothing. The user sees zero badges and zero explanation — while the README's
troubleshooting section (`README.md:199-210`) promises a `[YT-Metadata-Pro]` log for the
failure case. The only clue is a service-worker console message the user will not be looking at.

---

## 6. Low / latent: `href*=` substring selector

`extension/content.js:64`

```js
document.querySelectorAll('a[href*="/watch?v=' + id + '"], a[href*="&v=' + id + '"]')
```

`*=` is an unanchored substring match. Constructed case with three anchors and
`id = dQw4w9WgXcQ`:

```
HITS:3 a1,a2,a3
```

`a2` was `/watch?v=dQw4w9WgXcQxyz` — an unrelated video. Real YouTube IDs are exactly 11
characters, so in practice collisions are unlikely, but the selector is still the wrong tool.
Parse the URL and compare `searchParams.get('v') === id` instead.

---

## 7. Medium: channel/browse pages are never scanned

Live DOM dump of `https://www.youtube.com/@RickAstleyYT/videos`:

```
ytd-thumbnail            16
yt-lockup-view-model     60
ytd-rich-item-renderer   90
```

Of the 30 parsed `yt-lockup-view-model` elements, **30 contained `/watch?v=` links and 0
contained a `ytd-thumbnail`**. `content.js:104` only observes `ytd-thumbnail`, so on channel
and browse surfaces the extension silently does nothing. The manifest matches
`*://*.youtube.com/*`, so the user reasonably expects coverage there. The watch-page sidebar
also rendered no `ytd-thumbnail` in a fresh-profile dump.

Search results still work today (605 `ytd-thumbnail` elements observed), but YouTube is
mid-migration to the `*-view-model` components, so this will spread.

---

## 8. Low: Shorts are never scanned

`content.js:86` extracts IDs only from the `v` query parameter. Shorts links are
`/shorts/<id>` with no query string, so they are skipped by both the observer and the
`a[href*="&v="]` badging pass. Live search page: 34 shorts anchors, **0** inside a
`ytd-thumbnail`.

---

## 9. Low: the validator locks in the bug

`scripts/validate-extension-package.mjs:55` asserts:

```js
if (!backgroundContent.includes("contentDetails?.licensedContent === true")) throw ...
```

It is a string-presence smoke test, not a behaviour test. It passes on the mislabelled
implementation and would **fail** if someone correctly reframed or replaced the signal.
`npm run lint` (`package.json:9`) is an alias for the same script, so there is no real lint
or unit coverage. There is no test that any badge lands on the right thumbnail.

---

## 9b. Medium (docs): the README screenshot is itself a counterexample

`screenshots/music-badge-example.png` (added in `d2cad72`, "Polish README") shows a green
`MUSIC` badge on a row titled **"T-Pain - Chopped N Skrewed [HQ]"** by **Giannini Urban**
(742k views, 15 years ago).

That is video `NqdX0wEJU0o`, and the live API returns:

```
id        : NqdX0wEJU0o
title     : T-Pain - Chopped N Skrewed [HQ]
channel   : Giannini Urban
licensed  : False
cat       : 10
```

So the code as shipped would **not** badge the very video used to advertise the extension —
the badge in the image is either hand-edited, from an earlier build, or from a different
condition than `licensedContent === true`. Either way it misrepresents current behaviour, and
it also undercuts the "this flags re-uploads" story: the one re-upload in the picture is
`licensedContent: false`, while the official `TPainVEVO` upload next to it is `true`.

Worth re-shooting the screenshot after deciding item 1.

---

## 10. Trivial: version drift and metadata

- `extension/manifest.json:4` is `"1.0"`; `package.json:4` is `"1.0.0"`; the GitHub release is
  `v1.0.0`.
- `extension/manifest.json:5` description says "Highlights licensed music on YouTube", which
  bakes the same overclaim from issue 1 into the store listing.
- `README.md:190` refers to `dist/` inspection but `dist/` is gitignored (expected) — fine.
- The repo ships no API key, correctly, but a key was supplied ad-hoc during this audit. It is
  **not** written anywhere in the repo; `scripts/probe-licensed-content.mjs` reads `YT_API_KEY`
  from the environment only. If that key is real, consider rotating it, since it was pasted
  into chat.

---

## Recommended order of work

1. **Decide the product framing for issue 1** — this is the only item that changes what the
   tool *is*. Everything else is mechanical. The measured data (66% of badges on non-music)
   should drive this.
2. Re-shoot `screenshots/music-badge-example.png` to match the decided behaviour (issue 9b).
3. Fix the DOM state model (issues 2, 3, 6): reconcile per node + per current video ID, clear
   stale badges, compare IDs exactly.
4. Fix retry/error semantics (issues 4, 5): pending vs resolved, requeue on error, explicit
   no-key error surfaced to the page console.
5. Extend coverage to `yt-lockup-view-model` / `yt-thumbnail-view-model` and `/shorts/<id>`
   (issues 7, 8).
6. Add real tests: a headless-DOM harness that asserts badge placement, plus the validator
   asserting behaviour rather than source strings (issue 9).

---

## Reproducing the empirical checks

```bash
# Measurement across mixed categories (search.list = 100 units/query, videos.list = 1 unit/call)
YT_API_KEY=... node scripts/probe-licensed-content.mjs

# Dump raw rows for your own analysis
YT_API_KEY=... OUT_JSON=/tmp/rows.json node scripts/probe-licensed-content.mjs
```

The script never prints or persists the key.

---

## Evidence index (external)

- Google, [`videos` resource — `contentDetails.licensedContent`](https://developers.google.com/youtube/v3/docs/videos)
- Google, [YouTube Content ID API (partner-only)](https://developers.google.com/youtube/partner)
- Google Support, [How Content ID works](https://support.google.com/youtube/answer/2797370)
- SO 54917219 — [claimed and unclaimed uploads both returned `licensedContent: false`](https://stackoverflow.com/questions/54917219/use-youtube-api-v3-check-the-video-copyright-whether-is-claimed-by-partner-but-l)
- SO 71488550 — [a "normal video" also returned `licensedContent: true`](https://stackoverflow.com/questions/71488550/detect-whether-a-youtube-video-is-licensed-or-not)
- SO 47604389 — [`licensedContent` is not a copyright answer; NCS returns true](https://stackoverflow.com/questions/47604389/how-to-find-out-whether-a-video-is-copyright-protected-youtube-api-v3)
- Google Issue Tracker 122506827 — [music attribution block is `Song / Artist / Album / Writers / Licensed to YouTube by`](https://issuetracker.google.com/issues/122506827)
- ytmusicapi FAQ — [OMV / ATV / UGC `musicVideoType` definitions](https://ytmusicapi.readthedocs.io/en/stable/faq.html)

## Evidence index (in-repo, reproducible)

- `scripts/probe-licensed-content.mjs` — live-API measurement harness (new, this audit)
- `/tmp/rows.json` — 300 raw rows from the mixed-category run (not committed)
- Headless DOM simulations for issues 2/3/6 — commands described inline in each section

---

## Q&A: "Is the tool still usable for flagging audio-fingerprinted uploads to save a click?"

**No — not for that intent, in its current form.** The honest breakdown:

### What it does correctly

- It loads, validates, calls the API correctly, stores the key locally, and has no telemetry.
- It badges videos uploaded to YouTube partner/content-owner channels. That is a real,
  verifiable signal.
- On a page of mainstream official music, the badge is often *right* — measured 21/25 on
  "official music video" — because big-label uploads are both partner channels and music.

### What it does not do

- **It does not detect fingerprinting / Content ID identification.** Measured: four vinyl rips
  with YouTube's own "Song credits" panel (artist + album + writers) all returned
  `licensedContent: false`. The identification happened; the field does not reflect it.
- **It misses ~86% of vinyl-rip/remix results** (29/200 flagged).
- **It false-positives on non-music ~66% of the time** (138/209 flagged videos were not in
  the Music category), so the `MUSIC` label is wrong on news, sports, education and film.
- It therefore often does the *opposite* of saving a click: you still have to open the
  unflagged reuploads, and you may waste a click on a flagged news video.

### When it still "saves a click"

- You are scanning mainstream official music and want to distinguish label/`- Topic` uploads
  from random UGC. There the channel-name cue and the badge mostly agree, and it is a mild
  convenience — though the channel name usually tells you already.
- It is **not** a reliable triage gate for "is this upload already identified as a registered
  work, so I should avoid reusing it". For that it will both miss real matches and invent
  matches.

### What would actually satisfy the original intent

The signal that matches the goal is the **"Song credits" / music-attribution panel** that
YouTube renders on the watch page (Song / Artist / Album / Writers / "Licensed to YouTube by").
It is present exactly when YouTube has identified the work, including on unflagged rips —
verified above. It is *not* exposed by the public Data API, so a correct tool would have to
read it from the watch page (or from `ytInitialData`) rather than `licensedContent`.

Practical options, cheapest first:

1. **Relabel honestly** — call it `PARTNER` / `LICENSED`, keep it as a coarse publisher signal.
   Immediate fix for the mislabelling; does not fix the misses.
2. **Add `categoryId == 10`** — distinguishes "filed as Music" from "partner channel"; free.
3. **Scrape the watch-page song-credits panel for the real answer** — this is what the product
   actually needs, but it is unofficial, requires fetching each watch page (costly, fragile),
   and moves the extension away from its current "one cheap API call" design.
4. **Be explicit about the limit** — no API-key-accessible field answers "is this audio
   fingerprinted". The tool can only ever be a heuristic, and should say so.

**Bottom line:** as shipped, the green `MUSIC` badge is not a fingerprint detector. It is a
"big publisher channel" indicator wearing a music label. The click-saving value is limited and,
on the vinyl/remix content that motivated the project, largely absent.
