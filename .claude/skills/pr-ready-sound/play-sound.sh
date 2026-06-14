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

# Resolve the skill directory so the bundled sound is found regardless of CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# Preferred custom sound (not committed to git). Override with PR_SOUND_FILE.
# If this file is missing we fall back to the system alarm sound below.
CUSTOM_SOUND="${PR_SOUND_FILE:-$SCRIPT_DIR/bruh.mp3}"

# A jarring "alarm" sound shipped on most Linux desktops, used as the fallback
# when the custom sound file is not present.
ALARM_SOUND="/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga"

# Play the custom sound file once, using whatever player handles MP3.
# Returns 1 (so callers fall back) if the file is missing or nothing can play it.
play_custom_once() {
  [ -f "$CUSTOM_SOUND" ] || return 1
  if command -v ffplay >/dev/null 2>&1; then
    ffplay -nodisp -autoexit -loglevel quiet "$CUSTOM_SOUND" >/dev/null 2>&1 && return 0
  fi
  if command -v mpg123 >/dev/null 2>&1; then
    mpg123 -q "$CUSTOM_SOUND" >/dev/null 2>&1 && return 0
  fi
  if command -v afplay >/dev/null 2>&1; then   # macOS handles mp3 natively
    afplay "$CUSTOM_SOUND" >/dev/null 2>&1 && return 0
  fi
  if command -v paplay >/dev/null 2>&1; then
    paplay "$CUSTOM_SOUND" >/dev/null 2>&1 && return 0
  fi
  return 1
}

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
  # Prefer the custom sound (e.g. bruh.mp3); fall back to the system alarm.
  play_custom_once && return 0
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
