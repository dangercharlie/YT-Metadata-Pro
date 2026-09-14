# How we got here — retiring the v1 signal

Why v1 was retired and what replaced it. **Not required reading** — the short version is in the
[README](../README.md#a-note-on-v1).

> Full evidence trail, reproduction steps and the complete audit are in git history:
> `git show 9112bcf:AUDIT.md` (that commit predates the rename to `docs/`).

---

## What v1 did

Badged uploads with a green **MUSIC** label when the YouTube Data API reported
`contentDetails.licensedContent === true`. Also required every user to create a Google Cloud
project and paste in their own API key.

## Why that was wrong

Per [Google's own docs](https://developers.google.com/youtube/v3/docs/videos), that field means:

> the content was uploaded to a channel linked to a YouTube content partner and then claimed by
> that partner.

That is a property of the **uploading channel**, not of the audio. Measured against the live API
across 499 videos:

| Problem | Measured |
|---|---|
| Non-music false positives | **66%** of flagged videos were not in the Music category — `MUSIC` appeared on news, sport and education videos |
| Missed target content | **86%** of vinyl-rip and remix results were not flagged (29/200) |
| Proved false negatives | 4 vinyl rips showing YouTube's own song-credits panel (artist, album, writers) all returned `false` |

It was closer to a "large publisher channel" indicator wearing a music label.

## What replaced it

YouTube renders a **song-credits panel** (Song / Artist / Album / Writers) exactly when it has
identified an upload as a registered work. That is the signal v2 reads. It needs no API key.

Choosing it, and the comparison against alternatives, is in
[`SIGNAL-RESEARCH.md`](SIGNAL-RESEARCH.md).

## Bugs fixed along the way

Reproduced in v1, all fixed in v2:

| Problem | Fix |
|---|---|
| Stale badges when YouTube reused a thumbnail for a different video | Badges reconciled against the video a node currently shows |
| Recycled thumbnails never re-checked; a transient error blacklisted a video forever | Bounded retry with backoff; failures never cached |
| `href*="/watch?v=ID"` substring match could select the wrong video | Video IDs parsed and compared exactly |
| Only `ytd-thumbnail` scanned | Covers `yt-thumbnail-view-model`, `yt-lockup-view-model` and Shorts |
| A missing API key produced no badges and no diagnostic | No key needed |

## Not a copyright oracle

The badge reports **what YouTube has identified**. It is not a statement about your rights, and
no badge does not mean "safe to reuse". Content ID matches *recordings*, not songs — an official
release may be identified while a vinyl pressing or B-side of the same track is not. That is
usually the distinction worth knowing.
