#!/bin/bash
# Makes the watch's copies of the iPhone's 2-Min Brush songs: the same picks as the phone
# (brush_along while brushing, accra while flossing, aurora while rinsing), cut to each stage's
# length and made mono at 96 kbps for the watch's small speaker (about 3 MB in all).
# Run again after replacing any of those songs in MouthLifeApp/Music.
set -euo pipefail
cd "$(dirname "$0")"
SRC=../../MouthLifeApp/Music
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

make() { # name source seconds (0 = whole song)
  local name=$1 src=$2 sec=$3
  if [ "$sec" = 0 ]; then
    cp "$SRC/$src.m4a" "$TMP/$name.m4a"
  else
    avconvert --source "$SRC/$src.m4a" --preset PresetAppleM4A --output "$TMP/$name.m4a" --duration "$sec" --replace >/dev/null 2>&1
  fi
  # mix down to mono first (afconvert cannot change the channels while encoding AAC)
  afconvert -f caff -d LEF32@48000 -c 1 --mix "$TMP/$name.m4a" "$TMP/$name.caf"
  afconvert -f m4af -d aac -b 96000 "$TMP/$name.caf" "$name.m4a"
  echo "$name.m4a: $(afinfo "$name.m4a" | awk '/estimated duration/ {print $3}') s"
}

make watch_brush brush_along 0   # 2:00 brush (the song is 2:01)
make watch_floss accra 47        # 0:45 floss
make watch_rinse aurora 62       # 0:30 or 1:00 rinse
