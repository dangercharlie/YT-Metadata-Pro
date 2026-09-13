# ⚠️ Archived: v1 — `licensedContent` signal (superseded)

**Do not install this.** It is kept for reference and history only.

This is the original extension. It badged YouTube results with a green **MUSIC** label based on
the YouTube Data API field `contentDetails.licensedContent`.

## Why it was retired

That field does **not** mean "this audio has been fingerprinted / identified as a registered
work". Per [Google's own docs](https://developers.google.com/youtube/v3/docs/videos) it means:

> the content was uploaded to a channel linked to a YouTube content partner and then claimed
> by that partner.

It is a property of the **uploading channel**, not of the audio. Measured consequences
(499 videos sampled against the live API):

| Problem | Measured |
|---|---|
| Non-music false positives | **66%** of flagged videos were not in the Music category — the badge printed `MUSIC` on news, sports and education videos |
| Missed target content | **86%** of vinyl-rip/remix results were not flagged (29/200) |
| Proved false negatives | 4 vinyl rips with YouTube's own "Song credits" panel (artist/album/writers) all returned `licensedContent: false` |

It also required every user to create a Google Cloud project and supply their own API key.

## What replaced it

The current `extension/` directory uses YouTube's **song-credits panel** — the signal that
actually appears when YouTube has identified a registered work. It needs no API key.

See the repository root `README.md` for the current extension, `AUDIT.md` for the full
investigation, and `FEASIBILITY.md` for the measured comparison.

## Status

Kept only so the history and the diff are legible. The manifest still declares the old
`MUSIC` badge behaviour, so loading it will produce incorrect labels on non-music content.
