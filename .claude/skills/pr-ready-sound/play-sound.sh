#!/usr/bin/env bash
# Plays a short "task complete" notification chime to signal a PR is ready to review.
# Tries the available audio players for the current OS and falls back to the terminal bell.
# Usage: play-sound.sh ["optional spoken/printed message"]
set -u

MSG="${1:-PR ready for review}"

# A pleasant "complete" sound shipped on most Linux desktops.
FREEDESKTOP_SOUND="/usr/share/sounds/freedesktop/stereo/complete.oga"

play_linux() {
  # 1. libcanberra event sound (themed, most reliable on GNOME/Ubuntu)
  if command -v canberra-gtk-play >/dev/null 2>&1; then
    canberra-gtk-play -i complete >/dev/null 2>&1 && return 0
  fi
  # 2. PulseAudio
  if command -v paplay >/dev/null 2>&1 && [ -f "$FREEDESKTOP_SOUND" ]; then
    paplay "$FREEDESKTOP_SOUND" >/dev/null 2>&1 && return 0
  fi
  # 3. ffplay (ships with ffmpeg)
  if command -v ffplay >/dev/null 2>&1 && [ -f "$FREEDESKTOP_SOUND" ]; then
    ffplay -nodisp -autoexit -loglevel quiet "$FREEDESKTOP_SOUND" >/dev/null 2>&1 && return 0
  fi
  # 4. ALSA (needs a wav; convert on the fly if ffmpeg is around, else skip)
  if command -v aplay >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1 && [ -f "$FREEDESKTOP_SOUND" ]; then
    ffmpeg -loglevel quiet -i "$FREEDESKTOP_SOUND" -f wav - 2>/dev/null | aplay -q >/dev/null 2>&1 && return 0
  fi
  return 1
}

play_macos() {
  if command -v afplay >/dev/null 2>&1; then
    for f in /System/Library/Sounds/Glass.aiff /System/Library/Sounds/Ping.aiff; do
      [ -f "$f" ] && afplay "$f" >/dev/null 2>&1 && return 0
    done
  fi
  return 1
}

played=1
case "$(uname -s)" in
  Darwin) play_macos && played=0 ;;
  Linux)  play_linux && played=0 ;;
  *)      played=1 ;;
esac

# Final fallback: terminal bell (audible if the terminal has it enabled).
if [ "$played" -ne 0 ]; then
  printf '\a' >&2
fi

# Always surface the message so there's a visible cue even when audio is muted.
printf '🔔 %s\n' "$MSG"
