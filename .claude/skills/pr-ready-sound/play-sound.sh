#!/usr/bin/env bash
# Loudly alerts the user that a PR is ready to review, then opens it in a new
# Firefox window.
# Tries the available audio players for the current OS and falls back to the
# terminal bell. The alert is intentionally repeated so it is hard to miss.
#
# Usage: play-sound.sh "message" "https://github.com/owner/repo/pull/123"
set -u

MSG="${1:-PR ready for review}"
URL="${2:-}"

# How many times to repeat the alert, and the gap between repeats (seconds).
REPEAT="${PR_SOUND_REPEAT:-4}"
GAP="${PR_SOUND_GAP:-0.35}"

# A jarring "alarm" sound shipped on most Linux desktops (more attention-grabbing
# than the gentle "complete" chime).
ALARM_SOUND="/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga"

# Play the alert exactly once. Returns 0 if some backend produced sound.
play_once_linux() {
  if command -v canberra-gtk-play >/dev/null 2>&1; then
    canberra-gtk-play -i alarm-clock-elapsed >/dev/null 2>&1 && return 0
  fi
  if command -v paplay >/dev/null 2>&1 && [ -f "$ALARM_SOUND" ]; then
    paplay "$ALARM_SOUND" >/dev/null 2>&1 && return 0
  fi
  if command -v ffplay >/dev/null 2>&1; then
    if [ -f "$ALARM_SOUND" ]; then
      ffplay -nodisp -autoexit -loglevel quiet "$ALARM_SOUND" >/dev/null 2>&1 && return 0
    fi
    # No sound file? Synthesize a harsh two-tone siren instead.
    ffplay -nodisp -autoexit -loglevel quiet -f lavfi \
      "sine=frequency=880:duration=0.25,sine=frequency=440:duration=0.25" \
      >/dev/null 2>&1 && return 0
  fi
  if command -v aplay >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1 && [ -f "$ALARM_SOUND" ]; then
    ffmpeg -loglevel quiet -i "$ALARM_SOUND" -f wav - 2>/dev/null | aplay -q >/dev/null 2>&1 && return 0
  fi
  return 1
}

play_once_macos() {
  if command -v afplay >/dev/null 2>&1; then
    for f in /System/Library/Sounds/Sosumi.aiff /System/Library/Sounds/Glass.aiff; do
      [ -f "$f" ] && afplay "$f" >/dev/null 2>&1 && return 0
    done
  fi
  return 1
}

play_once() {
  case "$(uname -s)" in
    Darwin) play_once_macos ;;
    Linux)  play_once_linux ;;
    *)      return 1 ;;
  esac
}

# Repeat the alert so it is genuinely hard to ignore.
any_played=1
i=0
while [ "$i" -lt "$REPEAT" ]; do
  if play_once; then
    any_played=0
  else
    printf '\a' >&2   # terminal-bell fallback for this repetition
  fi
  i=$((i + 1))
  [ "$i" -lt "$REPEAT" ] && sleep "$GAP"
done

# Always surface the message so there is a visible cue even when audio is muted.
printf '🔔🔔🔔 %s\n' "$MSG"

# Open the PR in a NEW Firefox window so the user can check it out.
open_in_firefox() {
  local url="$1"
  [ -z "$url" ] && return 0
  if command -v firefox >/dev/null 2>&1; then
    firefox --new-window "$url" >/dev/null 2>&1 &
  elif command -v firefox-esr >/dev/null 2>&1; then
    firefox-esr --new-window "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    # macOS: launch Firefox specifically, in a new window.
    open -a Firefox -n "$url" >/dev/null 2>&1 || open "$url" >/dev/null 2>&1
  else
    printf '   (could not find Firefox — open this URL manually: %s)\n' "$url"
    return 0
  fi
  printf '   Opening in Firefox: %s\n' "$url"
}

open_in_firefox "$URL"
