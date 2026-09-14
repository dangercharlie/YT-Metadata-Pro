#!/bin/bash
#
# extract-corpus.sh — download clean audio rips of the recognition test corpus.
#
# Output (all gitignored, local only):
#   corpus/full/<id>.m4a   full-quality audio (native container, best available)
#   corpus/full/<id>.mp3   full track, mono 16 kHz MP3 (portable, for upload tests)
#   corpus/clips/<id>_30s.mp3       30s from the middle
#   corpus/clips/<id>_30s_start.mp3 30s from the start
#   corpus/clips/<id>_12s.mp3       12s from the middle (min-match probe)
#
# Notes:
#   --cookies-from-browser chrome is REQUIRED in this environment. Without it,
#   googlevideo returns HTTP 403 on the media fetch (metadata still resolves,
#   which makes it look like a tooling bug rather than throttling).
#
#   The audio is third-party copyrighted material. It is kept out of git and must
#   not be redistributed. See docs/RECOGNITION-PLAN.md.
#
# Usage:
#   ./scripts/extract-corpus.sh              # whole corpus
#   ./scripts/extract-corpus.sh <videoId>    # one video

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FULL="$ROOT/corpus/full"
CLIPS="$ROOT/corpus/clips"
mkdir -p "$FULL" "$CLIPS"

# id|group|description
CORPUS=(
  # Group A — YouTube identified (badge shown)
  "6tTQ_tThE2Q|A|Dire Straits - Sultans of Swing (vinyl rip)"
  "vmhE9wW4rAA|A|Sade - Smooth Operator (vinyl rip)"
  "pjDxZ1bas44|A|Dire Straits - Money For Nothing (vinyl rip)"
  "7nZyoUxXKkI|A|Led Zeppelin - Stairway to Heaven (vinyl)"
  "WmSe19KY4wY|A|Radiohead - Creep (vinyl rip)"
  "f0VD17PCZo8|A|Pink Floyd - Echoes (vinyl rip)"
  "3LZgBT11ORg|A|New Order - Blue Monday (vinyl rip)"
  "9naZSiRQ1sY|A|Phil Collins - In the Air Tonight (vinyl rip)"
  # Group B — YouTube did NOT identify (no badge) — the interesting set
  "5LkJZbTUJvg|B|Aswad - Bubbling 12\" Remix (Simba)"
  "TVckiy6rcFQ|B|Aswad - Bubbling / Dubbling (Simba)"
  "vfamaa8ND9E|B|Aswad - Stranger ++ Dub (Grove)"
  "LqjH68SiOuk|B|Aswad - It's Not Our Wish / Stranger (Grove, A-side identified)"
  # Group C — controls
  "8ZGoxlCY-jY|C|Steely Dan - Can't Buy A Thrill (full album, 10 songs)"
  "DuaBO5aK6OQ|C|Dead Or Alive - You Spin Me Round (Murder Mix)"
  "L1taQtTWOPw|C|NEWS video (no music — negative control)"
)

want="${1:-}"

printf '%-13s %-6s %s\n' "ID" "GROUP" "DESCRIPTION"
printf '%s\n' "---------------------------------------------------------------------"
for row in "${CORPUS[@]}"; do
  IFS='|' read -r id group desc <<<"$row"
  [ -n "$want" ] && [ "$want" != "$id" ] && continue
  printf '%-13s %-6s %s\n' "$id" "$group" "$desc"
done
echo

fails=0
for row in "${CORPUS[@]}"; do
  IFS='|' read -r id group desc <<<"$row"
  [ -n "$want" ] && [ "$want" != "$id" ] && continue

  src="$FULL/$id.m4a"
  mp3="$FULL/$id.mp3"

  # --- full-quality audio, native container
  if [ ! -s "$src" ]; then
    if ! yt-dlp --no-warnings --no-playlist --cookies-from-browser chrome \
         -f "bestaudio" --extract-audio --audio-format m4a \
         -o "$src" "https://www.youtube.com/watch?v=$id" >/dev/null 2>&1; then
      echo "FAIL download  $id  ($desc)"
      fails=$((fails+1))
      continue
    fi
  fi

  # --- full track as mono 16k mp3 (portable for upload tests)
  if [ ! -s "$mp3" ]; then
    ffmpeg -hide_banner -loglevel error -i "$src" -ac 1 -ar 16000 -y "$mp3" 2>/dev/null
  fi

  # --- probe clips
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1 "$src" 2>/dev/null | cut -d= -f2 | cut -d. -f1)
  dur=${dur:-0}
  mid=$(( dur > 90 ? dur/2 - 15 : 0 ))

  [ -s "$CLIPS/${id}_30s.mp3" ]       || ffmpeg -hide_banner -loglevel error -ss "$mid" -t 30 -i "$src" -ac 1 -ar 16000 -y "$CLIPS/${id}_30s.mp3" 2>/dev/null
  [ -s "$CLIPS/${id}_30s_start.mp3" ] || ffmpeg -hide_banner -loglevel error -ss 0     -t 30 -i "$src" -ac 1 -ar 16000 -y "$CLIPS/${id}_30s_start.mp3" 2>/dev/null
  [ -s "$CLIPS/${id}_12s.mp3" ]       || ffmpeg -hide_banner -loglevel error -ss "$mid" -t 12 -i "$src" -ac 1 -ar 16000 -y "$CLIPS/${id}_12s.mp3" 2>/dev/null

  sz=$(du -h "$mp3" 2>/dev/null | cut -f1)
  cs=$(ls -1 "$CLIPS/${id}_"*.mp3 2>/dev/null | wc -l | tr -d ' ')
  printf 'ok   %-13s group=%s  %5ss  full=%s  clips=%s\n' "$id" "$group" "$dur" "${sz:-?}" "$cs"
done

echo
echo "full rips : $(ls -1 "$FULL"/*.mp3 2>/dev/null | wc -l | tr -d ' ')"
echo "clips     : $(ls -1 "$CLIPS"/*.mp3 2>/dev/null | wc -l | tr -d ' ')"
echo "failures  : $fails"
echo
echo "Location: $FULL"
echo "          $CLIPS"
