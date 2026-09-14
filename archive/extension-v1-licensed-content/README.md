# Archived: v1 — the first attempt

**Retired. Not maintained. Do not install.**

This is the original version of YT Metadata Pro. It is kept so the history and the reasoning
stay legible — the correction is the interesting part.

## What it did

It badged YouTube search results with a green **MUSIC** label based on the YouTube Data API
field `contentDetails.licensedContent`, and required each user to supply their own YouTube
Data API v3 key.

## Why it was wrong

That field does not mean "this audio has been identified as a registered work". Per
[Google's own documentation](https://developers.google.com/youtube/v3/docs/videos) it means:

> the content was uploaded to a channel linked to a YouTube content partner and then claimed
> by that partner.

It is a property of the **uploading channel**, not of the audio. Measured against the live API
across 499 videos, the badge:

| Problem | Measured |
|---|---|
| Non-music false positives | **66%** of flagged videos were not in the Music category — `MUSIC` appeared on news, sport and education videos |
| Missed target content | **86%** of vinyl-rip and remix results were not flagged (29/200) |
| Proved false negatives | 4 vinyl rips showing YouTube's own song-credits panel (artist, album, writers) all returned `licensedContent: false` |

It also required every user to create a Google Cloud project and paste in an API key, and had
several implementation bugs around YouTube's recycled DOM nodes — stale badges on the wrong
video, and thumbnails that were never checked at all.

## What replaced it

The current extension reads YouTube's **song-credits panel** — the signal that actually
appears when a recording has been identified. It needs no API key and one `storage`
permission.

- Current extension: [`../../extension/`](../../extension/)
- Main README: [`../../README.md`](../../README.md)
- Why it was retired and what replaced it: [`../../README.md`](../../README.md#a-note-on-v1)

## Status

The `v1.0.0` release has been withdrawn. The source is retained for reference only. The
manifest still declares the old `MUSIC` badge behaviour, so loading it will produce
incorrect labels on non-music content.
