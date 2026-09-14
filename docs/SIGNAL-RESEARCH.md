# Signal research — comparing candidate signals

How v2's identification signal was chosen. **Not required reading** — see the
[README](../README.md) for usage.

> Full measurements, release-risk analysis and per-provider notes are in git history:
> `git show 9112bcf:FEASIBILITY.md` (that commit predates the rename to `docs/`).

---

## The question

If you upload or curate music on YouTube, the question that matters is not "is this labelled as
music?" but:

> Has YouTube already identified this recording as a registered work?

The interesting cases are the ones that are *not* — a vinyl pressing, a 12" B-side, a dub, a
remix — sitting in the same results list as the official version.

## Signals tested

| Signal | Available to a personal API key? | Verdict |
|---|---|---|
| `contentDetails.licensedContent` | Yes | **Rejected.** Means "partner channel", not "identified". See [HOW-WE-GOT-HERE](HOW-WE-GOT-HERE.md) |
| `snippet.categoryId == 10` | Yes | Useful but incomplete — many reuploads file under 22/24 |
| `topicDetails.topicCategories` | Yes | Near-useless: 1 of 200 sampled videos returned `wiki/Music` |
| `snippet.description` attribution | Yes | Not populated in the API — zero of 9 VEVO/Topic uploads carried "Licensed to YouTube by" |
| Content ID claims (real) | **No** | Partner-only [Content ID API](https://developers.google.com/youtube/partner) |
| **Song-credits panel** | Read from the page | **Chosen.** The signal that actually appears when a recording is identified |

## Why the song-credits panel

YouTube renders a "Song credits" dialog (Song / Artist / Album / Writers) exactly when it has
matched an upload to a registered work. It appears in **server-rendered HTML** — no JavaScript
rendering needed — and also in the `youtubei/v1/next` response as plain JSON.

Measured behaviour across the corpus:

- **72%** of vinyl-rip and remix results flagged (vs 21% for `licensedContent`)
- **6.9%** flagged on a non-music sample, and all of those were true positives — creators using
  identified background music
- Correctly flagged the README's own example video, which `licensedContent` reported as `false`

## Why it works on reuploads

Content ID references specific **masters**, not songs. The official release of a track is
usually identified; a different pressing, a B-side or a dub of the same song often is not.

Verified on one physical record — a Grove Music 12" where YouTube credits the A-side
("It's Not Our Wish") but shows nothing for the B-side ("Stranger"), even on an upload
containing both.

That is not a limitation for this tool. It is the distinction the tool exists to surface.

## Delivery notes

Two retrieval paths are implemented, so a change to one does not break the extension:

1. `youtubei/v1/next` — the endpoint YouTube's own web client uses
2. The watch-page HTML — server-rendered fallback

Measured before shipping: 60/60 sequential requests returned the panel, 0 errors; 20 concurrent
requests all succeeded; no rate limiting, no captcha, no auth required. Client version strings
from 2019–2024 all still work, so the version constant is not brittle — and the extension now
scrapes the live version from the page anyway.

**This is an undocumented endpoint.** It can change without notice. The extension fails quietly
(no badge, no broken page) rather than loudly.
