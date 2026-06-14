#!/usr/bin/env bash
# Finish a PR to the team standard: upload the proof video to Dropbox, post the
# link as the first comment on the PR, then ring the alert and open the PR in a
# new Firefox window.
#
# Run this AFTER the PR has been created (e.g. with `gh pr create`) and AFTER the
# proof video has been recorded (see record-proof.sh).
#
# Usage:
#   finish-pr.sh <pr-number-or-url> <proof-video.mp4> ["one-line summary"]
#
# Example:
#   finish-pr.sh 7 /tmp/proof.mp4 "Reconcile models on provider switch"
set -u

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PR="${1:?usage: finish-pr.sh <pr-number-or-url> <video.mp4> [summary]}"
VIDEO="${2:?usage: finish-pr.sh <pr-number-or-url> <video.mp4> [summary]}"
SUMMARY="${3:-}"

command -v gh >/dev/null 2>&1 || { echo "ERROR: gh CLI is required." >&2; exit 2; }
[ -s "$VIDEO" ] || { echo "ERROR: proof video not found or empty: $VIDEO" >&2; exit 2; }

# Resolve the PR's canonical URL + number (works for a number, URL, or branch).
PR_JSON="$(gh pr view "$PR" --json number,url,title 2>/dev/null)" || {
  echo "ERROR: could not resolve PR '$PR' via gh." >&2; exit 2; }
PR_URL="$(printf '%s' "$PR_JSON"   | grep -oP '"url":\s*"\K[^"]+')"
PR_NUM="$(printf '%s' "$PR_JSON"   | grep -oP '"number":\s*\K[0-9]+')"
PR_TITLE="$(printf '%s' "$PR_JSON" | grep -oP '"title":\s*"\K[^"]+')"
[ -n "$SUMMARY" ] || SUMMARY="$PR_TITLE"

echo "→ PR #${PR_NUM}: ${PR_TITLE}" >&2

# 1. Upload the proof video to Dropbox (stdout = the public share URL).
echo "→ Uploading proof video to Dropbox..." >&2
VIDEO_URL="$(node "$SKILL_DIR/upload-dropbox.js" "$VIDEO")" || {
  echo "ERROR: Dropbox upload failed (see above). Is .env configured? (cp .env.example .env)" >&2; exit 3; }
echo "→ Dropbox link: ${VIDEO_URL}" >&2

# 2. Post the proof as the first comment on the PR.
COMMENT="$(printf '🎥 **Feature proof video** — %s\n\nWatch the recorded walkthrough of this change:\n%s\n\n_Uploaded to Dropbox by the pr-ready-sound skill._' "$SUMMARY" "$VIDEO_URL")"
echo "→ Posting proof comment on PR #${PR_NUM}..." >&2
gh pr comment "$PR_NUM" --body "$COMMENT" >/dev/null || {
  echo "ERROR: failed to post PR comment." >&2; exit 3; }
echo "✓ Comment posted." >&2

# 3. Ring the alert and open the PR in a new Firefox window.
bash "$SKILL_DIR/play-sound.sh" "PR #${PR_NUM} ready — ${SUMMARY}" "$PR_URL"
