---
name: pr-ready-sound
description: Play a loud, repeated alarm to alert the user the moment a pull request has been created, then open the PR in a new Firefox window for review. Use this immediately after successfully opening a PR (e.g. with `gh pr create`), or whenever the user asks to be pinged/alerted/notified that a PR is ready.
---

# PR Ready Sound

Loudly notify the user that a pull request is created and ready to check out,
then open it in a new Firefox window.

## When to use

Invoke this right after a PR is successfully created — typically the step
immediately following a `gh pr create` (or equivalent) that returns a PR URL.
Also use it any time the user asks to be alerted/pinged/notified once a PR is
ready for review.

## How to use

Run the bundled script with the PR message as the first argument and the **PR
URL as the second argument** so the script can open it in Firefox:

```bash
bash .claude/skills/pr-ready-sound/play-sound.sh \
  "PR #123 ready for review — <title>" \
  "https://github.com/owner/repo/pull/123"
```

The script:

- Plays a **jarring alarm sound, repeated several times** (default 4) so it is
  hard to miss — using whatever audio player is available
  (`canberra-gtk-play`, `paplay`, `ffplay`, or `aplay` on Linux; `afplay` on
  macOS). If no player works it falls back to the terminal bell, and if there is
  no sound file it synthesizes a two-tone siren with `ffplay`.
- Prints a `🔔🔔🔔 <message>` line so there is a visible cue even when muted.
- **Opens the PR URL in a new Firefox window** (`firefox --new-window`) so the
  user can immediately review it.

### Tuning the alarm

Environment variables control how disturbing it is:

- `PR_SOUND_REPEAT` — number of times to repeat (default `4`).
- `PR_SOUND_GAP` — seconds between repeats (default `0.35`).

```bash
PR_SOUND_REPEAT=8 PR_SOUND_GAP=0.2 bash .claude/skills/pr-ready-sound/play-sound.sh "MERGE ME" "$URL"
```

## Notes

- The script never fails the surrounding task: audio and the browser launch are
  best-effort, and it exits 0 in normal use.
- Firefox opens in the background (non-blocking); the script returns immediately
  after launching it.
- Still report the PR URL in your reply so the user has a clickable link
  alongside the audible alert and the opened window.
