#!/usr/bin/env bash
# Record a short screen-capture proof video of a feature, for attaching to a PR.
# Uses ffmpeg's x11grab. By default it records the PRIMARY monitor only.
#
# Usage:
#   record-proof.sh <output.mp4> [duration_seconds] [geometry]
#
#   output.mp4   where to write the recording (required)
#   duration     seconds to record (default 25)
#   geometry     X11 region as WxH+X+Y (default: the primary monitor from xrandr)
#
# Before recording: launch the app (`npm run dev`) and get the feature you want
# to demonstrate visible on the PRIMARY monitor. The recording starts ~2s after
# you run this and lasts <duration> seconds.
#
# Env:
#   PROOF_FPS        frames per second (default 30)
#   PROOF_COUNTDOWN  seconds to wait before recording starts (default 2)
set -u

OUT="${1:?usage: record-proof.sh <output.mp4> [duration] [geometry]}"
DURATION="${2:-25}"
GEOMETRY="${3:-}"
FPS="${PROOF_FPS:-30}"
COUNTDOWN="${PROOF_COUNTDOWN:-2}"
DISPLAY_ID="${DISPLAY:-:0}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg is required for screen recording but was not found." >&2
  exit 2
fi

# Resolve the capture region. Default = the monitor marked "primary" by xrandr.
if [ -z "$GEOMETRY" ]; then
  if command -v xrandr >/dev/null 2>&1; then
    GEOMETRY="$(xrandr 2>/dev/null | grep -oP '(?<=primary )\d+x\d+\+\d+\+\d+' | head -1)"
  fi
  # Fall back to the first connected monitor, then to a safe 1920x1080+0+0.
  if [ -z "$GEOMETRY" ] && command -v xrandr >/dev/null 2>&1; then
    GEOMETRY="$(xrandr 2>/dev/null | grep -oP '\d+x\d+\+\d+\+\d+' | head -1)"
  fi
  [ -z "$GEOMETRY" ] && GEOMETRY="1920x1080+0+0"
fi

# Split WxH+X+Y into size and offset for ffmpeg (-video_size WxH -i :0+X,Y).
SIZE="${GEOMETRY%%+*}"                 # WxH
OFFSETS="${GEOMETRY#*+}"               # X+Y
OFF_X="${OFFSETS%%+*}"
OFF_Y="${OFFSETS#*+}"

mkdir -p "$(dirname "$OUT")"

echo "🎬 Recording proof video" >&2
echo "   region:   ${SIZE} at +${OFF_X}+${OFF_Y} on ${DISPLAY_ID}" >&2
echo "   duration: ${DURATION}s @ ${FPS}fps" >&2
echo "   output:   ${OUT}" >&2
if [ "$COUNTDOWN" -gt 0 ] 2>/dev/null; then
  echo "   starting in ${COUNTDOWN}s — make sure the feature is on the primary monitor..." >&2
  sleep "$COUNTDOWN"
fi
echo "   ● REC ($DURATION s)..." >&2

ffmpeg -hide_banner -loglevel error -y \
  -f x11grab -framerate "$FPS" -video_size "$SIZE" -i "${DISPLAY_ID}+${OFF_X},${OFF_Y}" \
  -t "$DURATION" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -movflags +faststart \
  "$OUT"
rc=$?

if [ "$rc" -ne 0 ] || [ ! -s "$OUT" ]; then
  echo "ERROR: recording failed (ffmpeg exit $rc)." >&2
  exit 3
fi

SIZE_MB="$(du -m "$OUT" | cut -f1)"
echo "✓ Saved ${OUT} (~${SIZE_MB}MB)" >&2
# Print the path on stdout so callers can capture it.
echo "$OUT"
