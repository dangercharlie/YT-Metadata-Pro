# Feasibility: can we actually flag *identified* uploads?

Date: 2026-09-12
Status: **Verified feasible.** Prototype in `scripts/detect-identified.mjs`.

---

## The answer

Yes. There is a reliable, reachable signal, and it is **not** `licensedContent`.

YouTube renders a **"Song credits"** panel (Song / Artist / Album / Writers) on a watch page
exactly when it has identified a registered musical work in the upload. It appears for
fingerprinted uploads *including* user re-uploads and vinyl rips that `licensedContent`
reports as `false`.

Critically, it is **not** in the Data API, but it *is* in the YouTube watch page **without
JavaScript**, and also in the internal `youtubei/v1/next` endpoint as plain JSON. No browser
rendering, no API key, no OAuth required.

```bash
node scripts/detect-identified.mjs 6tTQ_tThE2Q vmhE9wW4rAA NqdX0wEJU0o
```

```
6tTQ_tThE2Q  IDENTIFIED  songs=1  {"Song":"Sultans Of Swing","Artist":"Dire Straits","Album":"Dire Straits","Writers":"Mark Knopfler"}
vmhE9wW4rAA  IDENTIFIED  songs=1  {"Song":"Smooth Operator (Single Version)","Artist":"Sade","Album":"The Best of Sade","Writers":"Helen Folasade Adu, Raymond St. John"}
NqdX0wEJU0o  IDENTIFIED  songs=1  {"Song":"Chopped N Skrewed","Artist":"T-Pain","Album":"Freeze"}
```

Note the last one: that is the README screenshot video, which `licensedContent` reports as
`false`. The new signal gets it right.

---

## Measured accuracy

### Vinyl / remix set (95 videos, from `vinyl rip`, `12 inch remix`, `bootleg remix`, …)

| Signal | Flags | Rate |
|---|---|---|
| `licensedContent` (current tool) | 20/95 | **21%** |
| Song-credits panel (proposed) | 68/95 | **72%** |
| — identified by YouTube but *not* flagged today | **56** | — |

So the current tool misses **56 of 95** target uploads that YouTube has demonstrably
identified.

### Non-music set (159 videos: news, NBA, cooking, Python tutorials, walking tours)

| Signal | Flags | Rate |
|---|---|---|
| `licensedContent` (current tool) | 135/159 | **85%** ← almost all wrong |
| Song-credits panel (proposed) | 11/159 | **6.9%** |

I inspected all 11 "positives" on the non-music set. **Every one was a true positive** — the
creator used licensed background music, and YouTube identified it:

```
vZk-nsUJoEM  cooking   Song: Tell Ur Girlfriend  | Artist: Lay Bankz
uWoB0_3wSrY  cooking   Song: Young Folks         | Artist: Peter Bjorn And John
b093aqAZiPU  Python    Song: Revenge Body Beat   | Artist: nana kwabena
ix9cRaBkVe0  Python    Song: Block Party         | Artist: Bad Snacks
HNF4ZL7Qzyw  nature    Song: Magical Gravity     | Artist: Asher Fulero
```

Arguably that is *correct behaviour for this product*: those videos do contain identified
music. If you want music-only, filter on `categoryId == 10` in addition.

**Bottom line: precision is effectively perfect (0 observed false positives), and recall on
the target content goes from 21% → 72%.**

---

## Practical constraints (measured)

| Property | Result |
|---|---|
| Needs JS rendering? | **No** — server-rendered in the HTML and the JSON endpoint |
| Needs an API key? | **No** |
| Needs cookies / login? | **No** — verified with a cold, unauthenticated request |
| Payload per video | ~325 KB (`WEB` client) / ~141 KB (`MWEB` client) |
| Latency per video | ~1.0 s average, sequential |
| Parallelism | 12 concurrent requests → all `200`, ~1.5 s total, no rate-limit headers |
| Blocks when unidentified | Yes — returns a clean absence, not an error |

### Client choice matters

| Client | Status | Bytes | Carries the panel? |
|---|---|---|---|
| `WEB` | 200 | 325 KB | ✅ yes |
| `MWEB` | 200 | 141 KB | ✅ yes, but see caveat |
| `WEB_EMBEDDED_PLAYER` | 200 | 31 KB | ❌ no |
| `TVHTML5_SIMPLY_EMBEDDED_PLAYER` | 200 | 42 KB | ❌ no |
| `ANDROID` | 400 | — | ❌ no |

**Caveat on `MWEB`:** it is ~2.3× smaller but I measured it 8/10 on the positive set
(missed `pjDxZ1bas44` and `3g81C5xwJto`, which `WEB` catches). Use `WEB`. The size is fine
for a lazy, on-demand fetch.

---

## What this means for the extension design

The current extension is cheap because `videos.list` handles **50 IDs in one 1-unit call**.
The new signal is **one request per video**, which is a real cost change. Design accordingly:

1. **Lazy + cached.** Only check videos that actually scroll into view (the existing
   `IntersectionObserver` already does this). Cache by video ID in `chrome.storage.local`
   with a TTL — the credits panel is stable, so most lookups happen once.
2. **Fetch from the content script, not the service worker.** These are same-origin
   `youtube.com` requests, so the content script can `fetch("/youtubei/v1/next", ...)` using
   the page's own origin. That avoids CORS and extra `host_permissions`, and looks like
   ordinary page traffic.
3. **Throttle.** 68 of 95 in ~1 s each is fine for a visible-results page (~20 thumbnails);
   add a small concurrency cap (4–6) and skip off-screen rows.
4. **Keep both signals.** They are complementary and the combination is informative:
   - credits panel = "YouTube identified a registered work" → the badge you actually want.
   - `licensedContent` = "partner channel" → cheap, batchable, but do **not** label it MUSIC.
5. **Cost reality:** a search page with 20 results means up to 20 × ~325 KB ≈ 6.5 MB, versus
   one 1-unit API call today. Mitigations: check only visible items, cache aggressively, and
   consider aborting on the first match if you only need a boolean.

---

## Risks / unknowns to check before shipping

- **This is an undocumented internal endpoint.** It is the same one the YouTube web client
  uses, so it works today, but it can change without notice. Treat it as best-effort and
  fail open (no badge) rather than breaking the page.
- **Client version string is hard-coded** (`2.20240101.00.00`). If YouTube starts rejecting
  it, the fix is to refresh the version; consider scraping the current version from the page
  or trying a couple of known-good values.
- **Region/language dependent.** The panel is localized; the parser matches English
  (`"Song credits"`, `"Music"`). For other locales, match the structural markers
  (`dialogMessages` with Song/Artist/Album runs) rather than English strings.
- **No API key needed** also means: no quota, no key management, and one less setup step for
  users. That is a genuine product simplification.

---

## Recommendation

Build a **v2 "Identified" badge** driven by the song-credits panel, and demote
`licensedContent` to a secondary "partner channel" indicator (or drop it).

The v2 badge finally does what the README always claimed: it flags uploads YouTube has
fingerprinted and identified as a registered work — including the vinyl rips and remixes that
are mixed in with already-identified results.

---

## Working prototype

`prototype-extension/` is a loadable MV3 extension implementing the above.

```bash
npm run zip:prototype      # -> dist/YT_Metadata_Pro_Identified_Prototype.zip
# or: chrome://extensions -> Developer mode -> Load unpacked -> prototype-extension/
```

What it does differently from the shipped `extension/`:

| Behaviour | shipped `extension/` | `prototype-extension/` |
|---|---|---|
| Signal | `licensedContent` (partner channel) | song-credits panel (actual identification) |
| Badge text | `MUSIC` | `IDENTIFIED` (+ tooltip with Song/Artist/Album) |
| API key | required | **not required** |
| Node recycling | stale badge persists | reconciled and cleared every 2s |
| Failed lookup | permanently blacklisted | not cached; retried |
| ID matching | `href*="/watch?v=ID"` substring | parsed and exact-matched (11-char validated) |
| Container support | `ytd-thumbnail` only | `ytd-thumbnail`, `yt-thumbnail-view-model`, `yt-lockup-view-model`, Shorts |
| Shorts | skipped | supported (`/shorts/<id>`) |
| Cache | none | local, TTL'd (7d positive / 6h negative) |
| Requests | 1 batch call / 50 IDs | lazy, visible-only, 4 concurrent, deduped |

### Verified behaviour (headless Chrome, unmodified prototype)

```
page with 1 identified + 1 not-identified video:
  RESULT|FETCH:IDENTIFIED1|FETCH:PLAINVIDEO1|observed=2|badges=1|texts=IDENTIFIED
  -> exactly one badge, on the right video

node recycling (node badged, then reused for a different video):
  prototype:  before-badge=YES | after-recycle=no            (correct)
  shipped:    before=YES | after-recycle=STALE-BADGE-ON-UNLICENSED  (bug reproduced)
```

### Live-endpoint parser accuracy

- 15/15 on a hand-checked mix of identified and non-identified videos, with full
  Song/Artist/Album/Writers extraction.
- 60-video broad run: vinyl/remix **45/60 = 75%**, non-music **3/60 = 5%**.
- `npm run test:identification` covers the parser offline (4/4 fixtures), including the
  regression where the credits block is not the first `dialogMessages` on the page.

### Known gaps in the prototype

- **Throttling is basic.** 4 concurrent, no backoff on 429. Add jittered retry before wide release.
- **Client version is hard-coded.** If YouTube rejects `2.20240101.00.00`, refresh it.
- **English/locale:** the credits *fields* are matched structurally, but the `"N songs"`
  subtitle regex is English-only. The parser still works without it (credits dialog is enough).
- **Not yet tested on a real logged-in YouTube session** — only cold, unauthenticated
  requests and a stubbed DOM. Load it in your own Chrome and try it on real searches.
- **Badge is text-only.** No popup hover card yet; the tooltip carries the credits.
- **The panel is a proxy for identification, not proof of a Content ID claim.** A claim could
  in principle exist without the credits panel surfacing. See the test case below for a
  worked example of a "not identified" result and how it was verified.

---

## Test case: `5LkJZbTUJvg` — "Aswad Bubbling 12" Remix" (Eden Audio)

Reported by the project owner ("we may have different results for search"). Verified on
2026-09-12. **Result: genuinely NOT identified — a true negative.**

Metadata (Data API):

```
title    : Aswad Bubbling 12" Remix on vinyl, from the best British Reggae band ever.
channel  : Eden Audio
category : 28 (Science & Technology)   <- filed oddly, but topics say Music/Reggae
licensed : False
topics   : ['Music', 'Reggae']
```

Detector: `NOT-IDENTIFIED`. Confirmed by six independent methods:

| Method | Target | Control `6tTQ_tThE2Q` (known identified) |
|---|---|---|
| `youtubei/v1/next` song-credits dialog | absent | **present** |
| Music panel header / "N songs" subtitle | absent | **present** |
| Raw watch HTML, `"Song credits"` | 0 | **1** |
| Fully JS-rendered watch DOM | 0 | **1** |
| Rendered screenshot — "Music in this video" panel | **not shown** | shown |
| Search results UI badge | **none** | n/a |
| 15 regions (US/GB/AU/NZ/DE/FR/CA/JP/BR/IN/NG/JM/ZA/NL/IE) | all absent | all present |

The control (`6tTQ_tThE2Q`) is a vinyl rip too, and it *is* identified — so the method is not
failing on vinyl rips in general; this specific upload simply has no identification.

### Natural experiment: the same song, every version

Searching "Aswad Bubbling" gives a clean separation:

| Version | Videos | Identified |
|---|---|---|
| Official album/single (`Aswad - Topic`, VEVO) | 2 | **2/2** |
| Official live (`Aswad - Topic`) | 3 | **3/3** |
| **12" remix (the target)** | 1 | **0/1** |
| Fan vinyl rips | 4 | **0/4** |
| Fan live recordings | 3 | **0/3** |

The official releases of "Bubbling" are identified with full credits
(`{"Song":"Bubbling","Artist":"Aswad",...}`) while the 12" remix, fan rips and fan live
recordings are not. That is internally consistent and is exactly the distinction the product
wants to make — this is a case where the tool should stay dark.

### Why this case matters

It is a **good** negative: the video is a real vinyl rip of a real copyrighted work, and
YouTube has no identification for it. If the intended behaviour is "badge what YouTube has
identified", the correct output is *no badge*.

The honest caveat: the song-credits panel reflects YouTube's identification, which is
normally the same event that creates a Content ID claim, but I cannot rule out a claim that
exists without surfacing the panel. If the owner has external evidence this upload *is*
claimed (e.g. seen in YouTube Studio for the rights holder), that would be a genuine false
negative and a reason to look for an additional signal.

---

## Test case 2: `TVckiy6rcFQ` — "Aswad - Bubbling / Dubbling" (Germán Limón, Simba 12")

Reported by the project owner. Verified 2026-09-12. **Result: genuinely NOT identified.**

```
title    : Aswad - Bubbling / Dubbling
channel  : Germán Limón
category : 22
licensed : False
topics   : ['Music', 'Music_of_Latin_America', 'Pop_music', 'Reggae', 'Soul_music']
desc     : 00:00 A- Bubbling   04:30 B- Dubbling   1985 Simba 12"
```

Confirmed NOT-IDENTIFIED by: `next` endpoint (17 regions, all negative), raw watch HTML
(0 × "Song credits"), and a rendered screenshot showing no "Music in this video" panel.

### The finding: Content ID matches *recordings*, not songs

This is the same underlying song as the official Aswad "Bubbling", yet:

| Upload | Identified? |
|---|---|
| `Ppb_Sfh8FEA` — Aswad - Topic (official album version) | **YES** |
| `TVckiy6rcFQ` — Simba 12" "Bubbling / Dubbling" (fan) | no |
| `5LkJZbTUJvg` — Simba 12" "Bubbling 12\" Remix" (fan) | no |

So the *song* is in Content ID, but the **Simba 12" recording is a different master** that the
album reference does not match. Content ID references specific recordings, which is exactly
why vinyl rips, remixes, dubs and alternate mixes are the classic false-negative case.

A wider Simba-pressing sample (10 fan uploads) gave **4/10 identified** — so it is per-track,
not "everything on Simba is unidentified":

| Identified (4) | Not identified (6) |
|---|---|
| Dennis Brown & Aswad — Promised Land (Extended Mix) | Aswad — Bubbling / Dubbling |
| Aswad — Finger Gun Style (12" Extended) | Aswad — Bubbling 12" Remix |
| Dennis Brown — Promise Land Dub | Aswad — Roots Rockin (Extended) |
| Aswad — Roots Rocking (discomix) | Aswad — Drummie Zeb Kool noh |
| | Michael Palmer & Aswad — Me Nah Run (1984) |
| | Jackie Parris & Aswad — When You Are Young |

Official `Aswad - Topic` equivalents: **6/6 identified**.

### Why this is useful

Two independent uploads of the same Simba 12" ("Bubbling") both come back unidentified, while
the official album version is identified. That consistency is the signature of a recording
that simply has no Content ID reference — not a detection failure.

**This is the product's core use case working correctly:** it distinguishes the official,
fingerprinted master from the un-fingerprinted vinyl/dub pressing of the same song.

---

## Test case 3: `vfamaa8ND9E` — "Aswad - Stranger ++ Dub" (Trasimedia, Grove Music 12")

Reported by the project owner. Verified 2026-09-12. **Result: genuinely NOT identified.**

```
title    : Aswad - Stranger ++ Dub
channel  : Trasimedia
category : 10 (Music)
licensed : False
topics   : ['Electronic_music', 'Music', 'Pop_music', 'Reggae']
desc     : Aswad - Stranger ++ Dub (1978) \n 12-inch \n label Grove Music
```

Confirmed NOT-IDENTIFIED by: `next` endpoint across **17 regions** (all negative), raw watch
HTML (0 × "Song credits"), and a rendered screenshot with no "Music in this video" panel.

### The sharpest case yet: same record, A-side identified, B-side not

The target contains **only the B-side** ("Stranger"). A different upload of the *same Grove
Music 12"* contains the **A-side** as well:

| Upload | Contents | Identified? |
|---|---|---|
| `LqjH68SiOuk` — Germán Limón | A-side **+** B-side | **YES — "It's Not Our Wish"** |
| `UBN8Nqql38Q` — jahharvey76 | A-side only | **YES — "It's Not Our Wish"** |
| `vfamaa8ND9E` — **TARGET** (Trasimedia) | **B-side only** | **no** |
| `5a9XAVFUs1E` — TheRevivalmaster | "STRANGER" | no |
| `hyvbo-4hWGk` — #20-century music videos | "Stranger" | no |

This is about as clean a demonstration as possible: the *same physical record*, where
YouTube's Content ID has a reference for "It's Not Our Wish" but **not** for the B-side
"Stranger". A 12" B-side is instrumentally similar (the target is "Stranger ++ Dub"), which
is why Content ID matched the A-side on one upload and left the B-side alone.

Note the third row: on `LqjH68SiOuk` — which contains *both* tracks — YouTube credits only
"It's Not Our Wish". Even when the B-side is present, it is not identified.

### Label comparison

Other Grove Music 1978 12" uploads from the same era **are** identified:

| Identified | Not identified |
|---|---|
| Aswad — It's Not Our Wish | Aswad — Stranger |
| Aswad — Babylon / Behold | |
| Aswad — Ways Of The Lord (12" A Extended) | |
| Aswad — Can't Walk The Street | |

Official `Aswad - Topic` controls: 4/4 identified.

### Why this matters

Three consecutive owner-supplied vinyl/dub uploads (`5LkJZbTUJvg`, `TVckiy6rcFQ`,
`vfamaa8ND9E`) are all correctly reported as not identified, and in each case there is an
identified sibling release of the same song to prove the detector is discriminating rather
than failing. The tool is separating fingerprinted masters from un-fingerprinted pressings —
exactly the click-saving behaviour the project was built for.

---

## Release risk: how flaky is the internal endpoint really?

The `youtubei/v1/next` endpoint is undocumented. Measured 2026-09-12 to quantify the actual
maintenance burden rather than guess at it.

### Client version is NOT brittle

Old client version strings still work — the endpoint does not pin to a current build:

| `clientVersion` sent | Panel returned? |
|---|---|
| `2.20240101.00.00` | ✅ |
| `2.20230101.00.00` | ✅ |
| `2.20220101.00.00` | ✅ |
| `2.20210101.00.00` | ✅ |
| `2.20200101.00.00` | ✅ |
| `2.20190101.00.00` | ✅ |
| `1.20240101.00.00` (wrong major) | ❌ |
| `0.1` (garbage) | ❌ |

Six years of plausible version strings all work. The failure mode is a *malformed* value, not
an *old* one — so the hard-coded version is far less fragile than it looks.

### It can be made self-healing

The live version is scrapeable from any YouTube page and works when used:

```
scraped live clientVersion: 2.20260911.01.00
call with scraped version -> SongCredits: true
```

So the extension can read the current version (and `INNERTUBE_API_KEY`) from the page it is
already running on, instead of shipping a constant. **Recommended for release.**

### Stability under load

| Test | Result |
|---|---|
| 60 sequential requests, same video | **60/60** returned the panel, 0 errors, 0 HTML responses |
| Latency | min/avg/max = 752 / 1151 / 1818 ms |
| 20 distinct videos at concurrency 10 | 0 non-200 |
| 20 distinct videos at concurrency 20 | 0 non-200 |

No rate limiting observed, no CAPTCHA, no auth required, no cookies. Comparable request rates
are what the YouTube web client itself generates during normal browsing.

### Edge cases degrade gracefully

Every one of these returned **HTTP 200 with valid JSON** — no exceptions, no HTML error pages:

| Input | Behaviour |
|---|---|
| Normal identified video | panel present |
| Huge mainstream video | panel present |
| **Nonexistent video id** | 200, ~14 KB JSON, no panel |
| **Empty video id** | 200, ~14 KB JSON, no panel |
| News video (no music) | 200, no panel |
| Owner's Simba 12" (not identified) | 200, no panel |
| NCS (free music) | panel present |
| Big Buck Bunny (CC) | 200, no panel |

A bad ID yields a small valid response, so the extension cannot crash on it.

### Four independent ways to get the signal

Redundancy is what really limits maintenance risk:

| Path | Works |
|---|---|
| 1. `youtubei/v1/next` (what the prototype uses) | ✅ |
| 2. Raw watch-page HTML (server-rendered, no JS) | ✅ |
| 3. `next` with the `MWEB` client | ✅ |
| 4. `next` with a 2021 client version | ✅ |
| 5. Official Data API | returns data, but the **wrong signal** (`licensedContent`) |

If path 1 breaks, paths 2–4 still work with small parser changes. The signal has been present
in the server-rendered HTML, so it is not a client-side-only behaviour that could vanish.

### Honest assessment

**Realistic risk:** moderate-low. This is the same endpoint the YouTube web client uses, and
the data it returns is structural (`dialogMessages` with Song/Artist runs), not a brittle
class name or DOM selector. The pattern has been stable across six years of client versions.

**What would actually break it:**
- YouTube removes the song-credits panel or moves it to a different response. → the parser
  would need updating; the HTML path is a fallback.
- YouTube adds bot protection to `youtubei` for cold, cookie-less requests. → currently none,
  but this is the most plausible future change for a consumer extension.
- `dialogMessages` shape changes. → covered by the fixture test (`npm run test:identification`).

**What would NOT break it:** client version aging, high concurrency, bad video IDs, regions.

### Practical recommendation for a public release

1. **Scrape the client version from the page** rather than hard-coding it — removes the main
   self-inflicted maintenance trigger.
2. **Try `next`, fall back to watch-page HTML** — two paths, one small parser each.
3. **Fail open**: never break the page, never badge on an error. Already implemented.
4. **Cache aggressively** — identifications are stable, so repeat lookups are rare.
5. **Ship the fixture test** so a parser fix is verifiable in seconds.
6. **Say it is best-effort in the README.** It is a heuristic over an unofficial endpoint, not
   a guaranteed API. Setting that expectation is fair to users and to you.

### Hardening implemented in the prototype

Following the risk analysis above, `prototype-extension/content.js` now includes:

1. **Self-healing client version** — scrapes `INNERTUBE_CLIENT_VERSION` from the page it is
   already running on, falling back to a known-good constant. Removes the main self-inflicted
   maintenance trigger.
2. **Two-path retrieval** — tries `youtubei/v1/next`, then falls back to the watch-page HTML.
   Verified end-to-end: with `next` forced to 404, the watch-page path still badges correctly.
3. **Failure vs negative distinction** — a well-formed response lacking the panel is a
   cacheable negative; an HTML interstitial or unparseable body is a *failure* and is never
   cached.
4. **Bounded retry with backoff** — failures are retried (2s, 4s, 8s, max 3 attempts), fixing
   a gap in the first prototype where a transient block stranded a thumbnail permanently.
   Verified: blocked → retried → `IDENTIFIED` recovered.

Both new paths are covered by headless tests:

```
next 404 -> falls back to /watch -> badge=IDENTIFIED
HTML interstitial from both paths -> no badge (not a false positive)
blocked on attempt 1-2, success on 3 -> badge=IDENTIFIED after retry
```
