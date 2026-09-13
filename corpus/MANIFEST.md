# Corpus manifest

Local audio rips of the recognition test corpus. **All files are gitignored** — this directory
contains third-party copyrighted audio and must not be committed or redistributed.

Extracted: 2026-09-13 · via `scripts/extract-corpus.sh` · **15/15 succeeded, 0 failures**

## Files per video

| File | Format | Purpose |
|---|---|---|
| `corpus/full/<id>.m4a` | AAC 48 kHz stereo, ~300 kbps | Native, highest-quality rip. Best fidelity for fingerprint matching. |
| `corpus/full/<id>.mp3` | MP3 16 kHz mono | Portable full track. Use for upload tests (small). |
| `corpus/clips/<id>_30s.mp3` | 30 s from middle | Standard recognition window |
| `corpus/clips/<id>_30s_start.mp3` | First 30 s | Position-sensitivity probe |
| `corpus/clips/<id>_12s.mp3` | 12 s from middle | Minimum-match-length probe |

Clip strategy follows the 2009 Content ID study, which found match position mattered
(a 30 s chunk from the *start* failed where one from the *middle* succeeded).

## Group A — YouTube **identified** (badge shown)

Badge state verified live via `node scripts/detect-identified.mjs <id>`.

| ID | Duration | Description | YouTube credits |
|---|---|---|---|
| `6tTQ_tThE2Q` | 389 s | Dire Straits — Sultans of Swing (vinyl rip) | Sultans Of Swing / Dire Straits / Mark Knopfler |
| `vmhE9wW4rAA` | 307 s | Sade — Smooth Operator (vinyl rip) | Smooth Operator (Single Version) / Sade |
| `pjDxZ1bas44` | 521 s | Dire Straits — Money For Nothing (vinyl rip) | Money For Nothing / Dire Straits / Brothers In Arms |
| `7nZyoUxXKkI` | 484 s | Led Zeppelin — Stairway to Heaven (vinyl) | Stairway to Heaven (Remaster) / Led Zeppelin |
| `WmSe19KY4wY` | 242 s | Radiohead — Creep (vinyl rip) | Creep / Radiohead / Pablo Honey |
| `f0VD17PCZo8` | 1415 s | Pink Floyd — Echoes (vinyl rip) | Echoes / Pink Floyd / Meddle |
| `3LZgBT11ORg` | 458 s | New Order — Blue Monday (vinyl rip) | Blue Monday (Instrumental Outtake) / New Order |
| `9naZSiRQ1sY` | 330 s | Phil Collins — In the Air Tonight (vinyl rip) | In the Air Tonight (2015 Remaster) / Phil Collins |

## Group B — YouTube did **NOT** identify (no badge) ← the interesting set

| ID | Duration | Description | Notes |
|---|---|---|---|
| `5LkJZbTUJvg` | 449 s | Aswad — Bubbling 12" Remix (Simba) | Same song as official release, different master |
| `TVckiy6rcFQ` | 539 s | Aswad — Bubbling / Dubbling (Simba) | 1985 Simba 12" |
| `vfamaa8ND9E` | 514 s | Aswad — Stranger ++ Dub (Grove) | B-side only |
| `LqjH68SiOuk` | 915 s | Aswad — It's Not Our Wish / Stranger (Grove) | **Mixed case**: A-side identified, B-side not |

`LqjH68SiOuk` is the sharpest test: one file containing both an identified and a
non-identified track.

## Group C — controls

| ID | Duration | Description | Purpose |
|---|---|---|---|
| `8ZGoxlCY-jY` | 4825 s | Steely Dan — Can't Buy A Thrill (full album) | Multi-song: 10 songs, tests multi-match |
| `DuaBO5aK6OQ` | 4284 s | Dead Or Alive — You Spin Me Round (Murder Mix) | Long mix, tests remix handling |
| `L1taQtTWOPw` | 1810 s | **News video, no music** | **Negative control** — must return no match |

All clips verified non-silent (mean volume ≈ −17 to −19 dB).

## What to expect

My stated prediction (from `RECOGNITION-PLAN.md`, recorded before testing): third-party
services will **agree with YouTube on Group A** and **also fail on Group B** — those Aswad
pressings being obscure 1978–85 UK reggae 12"s unlikely to be in MusicBrainz or a commercial
recognition database.

**If Group B *is* recognised by a third-party service while YouTube does not identify it, that
is the headline finding** — it would suggest the tracks are registered somewhere but absent
from YouTube's Content ID references.

## Constraints

- **Do not commit.** `corpus/` is gitignored; ~727 MB total.
- **Do not redistribute.** Third-party copyrighted audio, downloaded for local analysis only.
- Downloaded with `yt-dlp --cookies-from-browser chrome`. Without that flag, googlevideo
  returns HTTP 403 on the media fetch in this environment (metadata still resolves, which
  makes it look like a tooling bug — it is request throttling).
