---
name: pr-ready-sound
description: Play a notification sound to alert the user the moment a pull request has been created and is ready for them to review. Use this immediately after successfully opening a PR (e.g. with `gh pr create`), or whenever the user asks to be pinged/alerted/notified that a PR is ready.
---

# PR Ready Sound

Audibly notify the user that a pull request is created and ready for them to check out.

## When to use

Invoke this right after a PR is successfully created — typically the step
immediately following a `gh pr create` (or equivalent) that returns a PR URL.
Also use it any time the user asks to be alerted/pinged/notified once a PR is
ready for review.

## How to use

Run the bundled script from the skill directory. Pass a short message as the
first argument so the printed cue includes the PR title or number:

```bash
bash .claude/skills/pr-ready-sound/play-sound.sh "PR #123 ready for review — <title>"
```

The script:

- Plays a short "complete" chime using whatever audio player is available
  (`canberra-gtk-play`, `paplay`, `ffplay`, or `aplay` on Linux; `afplay` on
  macOS), and falls back to the terminal bell if none are present.
- Always prints a `🔔 <message>` line so there is a visible cue even when the
  machine is muted.

## Notes

- The script never fails the surrounding task: if no audio backend works it
  silently falls back to the bell and the printed message. It exits 0 either way
  in normal use.
- After playing the sound, still report the PR URL to the user in your reply so
  they have a clickable link alongside the audible alert.
