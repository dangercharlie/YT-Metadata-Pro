# Upload test set — 4 clips, 30 seconds each

Ready for the Phase 2 upload benchmark (see `../docs/RECOGNITION-PLAN.md` §4).

Upload these **unlisted**, wait for checks, read the result in YouTube Studio → Content →
Checks, then delete. Use a throwaway channel.

> These are third-party copyrighted recordings. Keep them out of git — `corpus/` is
> gitignored.

## Files, in test order

| # | File | Source | YouTube's verdict | What it tests |
|---|---|---|---|---|
| 1 | `1-positive-control_DireStraits_SultansOfSwing.mp3` | `6tTQ_tThE2Q` | **Identified** — Song: Sultans Of Swing · Artist: Dire Straits · Writers: Mark Knopfler | **Positive control.** Mainstream, well-registered, fullest credit block in the corpus |
| 2 | `2-mixed-case_Aswad_Grove12_A-side-identified_B-side-not.mp3` | `LqjH68SiOuk` | **A-side identified**, B-side not | **Internally controlled.** One record, both outcomes |
| 3 | `3-the-question_Aswad_Bubbling12Remix_Simba.mp3` | `5LkJZbTUJvg` | **Not identified** | **The actual question** |
| 4 | `4-negative-control_news-no-music.mp3` | `L1taQtTWOPw` | No music at all | **Negative control.** Must come back unclaimed |

All four are ~90 KB, 30 s, mono 16 kHz MP3.

## How to read the result

| #1 positive control | #3 the question | Conclusion |
|---|---|---|
| Claimed | Not claimed | **Method validated.** YouTube's verdict reproduced — the badge is honest and those pressings genuinely aren't registered |
| Claimed | **Claimed** | **The finding.** YouTube's panel didn't surface it but Content ID still matched — the badge has a real blind spot |
| Not claimed | anything | **Inconclusive.** The test is broken, not the tool |

Row 2 is the one worth running this for. It is the only outcome that would contradict what we
have concluded so far.

## Expected results

| # | File | Expect |
|---|---|---|
| 1 | Dire Straits | **Claimed** — if not, stop; the method is not working |
| 2 | Aswad Grove 12" | **Claimed on the A-side only** ("It's Not Our Wish"), silence on the B-side ("Stranger"). Match the *song title* reported, not just claimed/not |
| 3 | Aswad Simba 12" | **Not claimed** (my prediction — see below) |
| 4 | News | **Not claimed** |

**Stated prediction, recorded before testing:** #3 comes back unclaimed. My reasoning is in
`../docs/RECOGNITION-PLAN.md` — these are obscure 1978–85 UK reggae 12" pressings, and the Simba
"Bubbling" is a different master from the identified official release. If #3 *is* claimed,
that prediction is falsified and it is the headline result.

## Notes

- **#2 is the sharpest test.** Because it contains both an identified and a non-identified
  track, it removes the "maybe the whole record is just unregistered" explanation. YouTube
  demonstrably holds a reference for one half of it.
- **Match position matters.** These clips are taken from the *middle* of each track. A 2009
  study of YouTube's system found a 30 s chunk from the start failed where one from the middle
  succeeded. If a clip comes back unclaimed and you suspect a false negative, retry with
  `../clips/<id>_30s_start.mp3`.
- **Don't upload all four to the same channel if claims accumulate.** #1 and possibly #2 will
  attract claims by design.
