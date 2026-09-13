# Plan: third-party recognition testing against Content ID outcomes

Status: **planning only — no test uploads, no API spend, nothing executed yet.**

---

## 0. Correcting the premise first

Three things need to be settled before any testing, because they change the plan.

### 0.1 YouTube does not use a provider you can log into

Content ID is **Google's own in-house system**. It was originally licensed from
**Audible Magic** (2006, agreement terminated **2009**), after which Google built its own
fingerprinting. Audible Magic still sells ACR to other platforms (Twitch, SoundCloud,
Meta historically), but **there is no public Audible Magic portal that tells you whether a
video is Content ID-matched on YouTube**. Content ID itself is partner-only: the
[Content ID API](https://developers.google.com/youtube/partner) requires an onboarded
content-owner account.

**So "test against the provider YouTube uses" is not directly possible.** What *is* possible
is testing against **independent recognition services** and measuring how well they agree
with YouTube's outcome. That is a genuinely useful experiment — it just answers a different
question: *"do third-party fingerprinters predict YouTube's verdict?"* rather than *"reproduce
YouTube's verdict."*

### 0.2 Audible Magic is the wrong target even if it were reachable

Their reference database is built from **content owners who submit fingerprints directly**.
A 2009 study of YouTube's system found it picked up only what rights holders had registered.
Being absent from Audible Magic therefore tells you nothing about Content ID, and vice versa.
The two databases are populated by different sets of rights holders.

### 0.3 The one true oracle already exists: an unlisted test upload

YouTube runs Content ID **at upload time, before publish**. Upload as **unlisted/private**,
let the checks run (minutes), read the result in YouTube Studio, then delete. This is the
only method that reproduces YouTube's actual verdict, because it *is* YouTube's actual verdict.

It is also the highest-risk method — see §4.

---

## 1. What we are actually trying to learn

Reframe the objective into testable questions:

| # | Question | Why it matters |
|---|---|---|
| Q1 | Do third-party services (AudD / ACRCloud / AcoustID) agree with our `IDENTIFIED` badge on our known set? | Tells us whether our signal is a good proxy for "recognisable as a registered work" |
| Q2 | Do they agree with YouTube's Content ID verdict (via unlisted upload)? | The real question — but needs new uploads |
| Q3 | For our *failing* cases (Simba 12", Grove B-side), does any service recognise them? | Explanatory power — do they fail because the track is unregistered, or because it's a different master? |
| Q4 | Do Audio-only vs Video-with-audio change recognition? | Tests whether video fingerprinting adds anything |

Q1 and Q3 are cheap and safe. Q2 and Q4 require uploading.

---

## 2. The test corpus

We already have ground truth from this session — 15 videos, no new uploads needed:

**Group A — YouTube identified (badge shown)**
```
6tTQ_tThE2Q  Dire Straits — Sultans of Swing (vinyl rip)
vmhE9wW4rAA  Sade — Smooth Operator (vinyl rip)
pjDxZ1bas44  Dire Straits — Money For Nothing (vinyl rip)
7nZyoUxXKkI  Led Zeppelin — Stairway to Heaven (vinyl)
WmSe19KY4wY  Radiohead — Creep (vinyl rip)
f0VD17PCZo8  Pink Floyd — Echoes (vinyl rip)
3LZgBT11ORg  New Order — Blue Monday (vinyl rip)
9naZSiRQ1sY  Phil Collins — In the Air Tonight (vinyl rip)
```

**Group B — YouTube did NOT identify (no badge)**
```
5LkJZbTUJvg  Aswad — Bubbling 12" Remix        (Simba)
TVckiy6rcFQ  Aswad — Bubbling / Dubbling       (Simba)
vfamaa8ND9E  Aswad — Stranger ++ Dub           (Grove)
LqjH68SiOuk  Aswad — It's Not Our Wish/Stranger (Grove, A-side identified)
```

**Group C — controls**
```
8ZGoxlCY-jY  Steely Dan — Can't Buy A Thrill (10 songs, full album)
DuaBO5aK6OQ  Dead Or Alive — You Spin Me Round (Murder Mix)
L1taQtTWOPw  News video (no music — negative control)
```

**Critical design point:** Group B is the interesting set. If third-party services *also* fail
on the Aswad tracks, that supports "these masters simply aren't registered anywhere" — which
would validate our badge as honest. If a service *does* recognise them while YouTube doesn't,
that's a genuine finding worth documenting (and possibly a product opportunity).

---

## 3. Phase 1 — no upload, no risk (START HERE)

### 3.1 Extract audio from the corpus

Tooling is already present: `yt-dlp 2026.03.17`, `ffmpeg 9.0.1`, `librosa 0.11.0`, `numpy`.

For each video: download audio-only, and cut a few standard probe clips:

| Clip | Purpose |
|---|---|
| `full.mp3` (mono, 16 kHz) | Cheap upload if the service accepts |
| `clip30.mp3` (30s from middle) | Standard recognition window |
| `clip12.mp3` (12s) | Tests minimum-match length |
| `clip30_start.mp3` (first 30s) | The 2009 study found position mattered |

Deliberately **do not** normalise loudness or resample beyond what the service needs — we want
to measure their sensitivity, not clean the audio.

### 3.2 Run against cheap/free services

| Service | Cost | Notes |
|---|---|---|
| **AcoustID** (MusicBrainz) | **Free**, open API | Fingerprints against MusicBrainz. Good baseline: if a track isn't in MusicBrainz, absence proves little |
| **AudD** | Free trial; ~$5/1,000 requests per third-party pricing summaries | Purpose-built for "copyright checking"; accepts files and URLs |
| **ACRCloud** | Trial available; paid tiers | 150M+ tracks, industry standard for UGC screening |
| **Audible Magic** | Enterprise, quote-only | **Skip** — no self-serve tier, and it is not YouTube's system anyway |

Start with **AcoustID (free) + AudD (cheap)**. Only escalate to ACRCloud if the first two
disagree in interesting ways.

### 3.3 Record a confusion matrix

For every video × service × clip-length:

```
                 YouTube says IDENTIFIED   YouTube says NOT
AudD says YES            [hit]                [miss?]
AudD says NO             [miss?]              [agree]
```

This directly answers Q1 and Q3, and it is the deliverable that makes the badge's honesty
measurable rather than asserted.

### 3.4 Expected outcome

My prediction, stated in advance so it can be falsified: third-party services will agree with
YouTube on **Group A** (mainstream Western catalogue, well-registered), and **also fail on
Group B** — because those are obscure 1978–1985 UK reggae 12" pressings that are unlikely to
be in MusicBrainz or a commercial recognition DB. If Group B *is* recognised, that is the
headline finding.

---

## 4. Phase 2 — the true oracle (requires uploads; read this carefully)

This is the only method that reproduces YouTube's actual Content ID verdict.

### Method
1. Build a short test video: a still image + the audio clip (≤60s keeps it light).
2. Upload as **unlisted** (not public).
3. Wait for the checks to complete (typically minutes).
4. Read the result in **YouTube Studio → Content → Checks** ("No issues found" vs a claim).
5. **Delete the upload.**

### Why this is high-risk and needs your explicit decision

- **It is 4–6 uploads of third-party copyrighted audio to your own YouTube account.** If
  claimed, you accumulate claims on your channel. Claims alone don't normally strike an
  account, but **repeat claims can affect monetisation standing**, and the 2009 experimenter's
  test account was eventually terminated (possibly manually).
- **Uploading may itself cause harm.** A claim could attach to the upload and live in your
  Studio history after deletion.
- **Use a dedicated channel**, never your main account, and never `dangercharlie`.
- **Legal/ToS position:** uploading content you don't own is a ToS matter regardless of intent.
  The 2009 study did exactly this and documented the account loss. I am not going to do this
  without you saying so explicitly, and I would not use an account you care about.

**My recommendation: run Phase 1 only, and treat Phase 2 as a decision you make separately.**
Phase 1 likely answers the question well enough, at zero risk and near-zero cost.

### A safer middle path for Q2
If you want YouTube's real verdict without repeatedly uploading third-party audio: **test with
your own material.** If you have audio you own or have licensed, upload that and confirm the
mechanism works — then you know the workflow without accumulating claims on other people's
content.

---

## 5. Deliverables

1. `scripts/extract-corpus.mjs` (or `.sh`) — reproducible corpus extraction with the standard clips.
2. `scripts/recognition-matrix.mjs` — runs providers, emits a CSV/JSON confusion matrix.
3. `RECOGNITION.md` — the write-up: method, matrix, and what it says about the badge's honesty.
4. An update to `FEASIBILITY.md` linking the finding, and possibly a line in the README's
   limitations if the results warrant it.

Keys for any paid service go in the environment only (`AUDD_TOKEN`, `ACOUSTID_KEY`) — never
committed, same rule as the YouTube key.

---

## 6. Suggested sequencing

| Step | Work | Risk | Cost | Decision needed |
|---|---|---|---|---|
| 1 | Extract corpus (Group A/B/C) | none | free | — |
| 2 | AcoustID pass (free) | none | free | — |
| 3 | AudD pass | none | ~$0–5 | sign up for a token |
| 4 | Build confusion matrix, write `RECOGNITION.md` | none | free | — |
| 5 | *(optional)* ACRCloud pass | none | trial/paid | only if 2–3 are ambiguous |
| 6 | *(optional)* Unlisted upload test | **ToS/account risk** | free | **explicit go-ahead + throwaway channel** |

---

## 7. What I need from you

1. **Green light for Phase 1** (extraction + free/cheap recognition). No risk, small cost.
2. **A decision on Phase 2**, or deferred. I would default to deferring.
3. **Whether to sign up for an AudD token**, or stay free-tier with AcoustID only.

Also note: extraction downloads audio from the videos in our corpus. That is fine for local
analysis, but I will keep the audio out of the repo (add to `.gitignore`) and not redistribute
it — the corpus is other people's copyrighted music.

---

## 8. Toolchain pre-verified (already checked in this session)

Everything Phase 1 needs is already installed and working:

| Component | Status |
|---|---|
| `yt-dlp` | **2026.03.17** — confirmed it resolves our corpus (`6tTQ_tThE2Q` → 389s) |
| `ffmpeg` / `ffprobe` | **9.0.1** — confirmed clip extraction (30s mono 16 kHz MP3 = 90 KB) |
| `fpcalc` (Chromaprint) | **installed** — required for AcoustID, no brew install needed |
| `librosa` / `numpy` | **0.11.0 / 2.4.4** — available if spectral analysis is wanted |
| `brew` | available, if anything else is needed |

Live API smoke tests:

- **AudD** — the public `test` token returns a real match
  (`Tears For Fears — Everybody Wants To Rule The World`), so the integration path is proven
  before spending anything.
- **AcoustID** — reachable and returning structured errors; needs a free API key
  (register an application at acoustid.org).

So Phase 1 has **no unknowns left in tooling** — only the recognition results themselves.

---

## 9. Honest caveat on what this can prove

Even a perfect third-party agreement would not prove our badge matches YouTube's Content ID
in general — it would only show three independent systems recognise the same mainstream
recordings. The badge's core claim is narrower and already verifiable: *YouTube surfaced an
identification panel for this upload*. That we can check directly, for free, at scale, with no
uploads — which is what the extension already does.

The genuinely open question this plan addresses is the one you raised: **why do the Aswad
tracks fail?** Phase 1 can answer that with no risk, and that is the interesting part.
