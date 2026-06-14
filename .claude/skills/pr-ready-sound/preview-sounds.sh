#!/usr/bin/env bash
# Auditions the candidate notification sounds one by one so you can pick one for
# the pr-ready-sound skill. Each sound's name is printed right before it plays.
#
# Usage:
#   bash preview-sounds.sh            # play every candidate with a pause between
#   bash preview-sounds.sh complete   # play just one by name (no .oga needed)
set -u

THEME_DIR="/usr/share/sounds/freedesktop/stereo"

# Curated, attention-worthy candidates (file basename without extension).
CANDIDATES=(
  alarm-clock-elapsed   # buzzy alarm clock — the current default, quite naggy
  bell                  # classic single "ding"
  complete              # gentle "task done" chime
  message-new-instant   # IM-style pop, short
  message               # softer message tone
  dialog-warning        # warning blip
  dialog-error          # error thunk
  dialog-information    # neutral info tone
  window-attention      # "look at me" attention sound
  phone-incoming-call   # ringtone-ish, loops urgent
  suspend-error         # harsh descending error
  device-added          # rising "plugged in" sound
  camera-shutter        # snap
  service-login         # warm login swell
)

play() {
  local name="$1" file="$THEME_DIR/$1.oga"
  if command -v canberra-gtk-play >/dev/null 2>&1; then
    canberra-gtk-play -i "$name" >/dev/null 2>&1 && return 0
  fi
  if command -v ffplay >/dev/null 2>&1 && [ -f "$file" ]; then
    ffplay -nodisp -autoexit -loglevel quiet "$file" >/dev/null 2>&1 && return 0
  fi
  if command -v paplay >/dev/null 2>&1 && [ -f "$file" ]; then
    paplay "$file" >/dev/null 2>&1 && return 0
  fi
  printf '   (could not play %s)\n' "$name"
  return 1
}

if [ "$#" -ge 1 ]; then
  printf '▶ %s\n' "$1"
  play "$1"
  exit 0
fi

printf 'Auditioning %d sounds — listen and note the name you like.\n\n' "${#CANDIDATES[@]}"
for name in "${CANDIDATES[@]}"; do
  printf '▶ %s\n' "$name"
  play "$name"
  sleep 1.2
done
printf '\nDone. Tell me the name you want and I will wire it into the skill.\n'
