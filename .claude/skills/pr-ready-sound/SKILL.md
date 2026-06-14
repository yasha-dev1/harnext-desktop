---
name: pr-ready-sound
description: Create pull requests to the team standard and announce them. After a PR is opened, record a short screen-capture proof video of the feature, upload it to Dropbox, post the public link as the PR's first comment, then play a loud repeated alarm and open the PR in a new Firefox window. Use whenever opening a PR, or when the user asks to be pinged/alerted that a PR is ready.
---

# pr-ready-sound

Open a pull request **the right way** and make sure the user notices. This skill
owns the full PR standard:

1. **Create** the PR with a correct, standardized title and body.
2. **Record** a short proof video of the feature (ffmpeg screen capture).
3. **Upload** the video to Dropbox and get a public link.
4. **Comment** that link as the first comment on the PR.
5. **Announce** — play a loud, repeated alarm and open the PR in a new Firefox
   window so the user can review it immediately.

## When to use

- Right after finishing a change that should become a PR.
- Any time the user says "open a PR", "make the PR", or asks to be
  alerted/pinged/notified once a PR is ready.

## The PR standard (step 1 — create accurately)

Before opening the PR, verify:

- You are on a feature branch off the latest `origin/main` — **never** commit to
  `main` directly. (`git fetch origin && git switch -c <type>/<slug> origin/main`)
- All intended changes are committed; `git status` is clean.
- The branch is pushed: `git push -u origin HEAD`.

Then create the PR with a clear title and a structured body:

```bash
gh pr create --base main --title "<type>: <concise summary>" --body "$(cat <<'EOF'
## Summary
<1-3 sentences on what changed and why>

## Changes
- <bullet per notable change>

## Testing
- <how it was verified>
EOF
)"
```

Use a conventional `<type>` prefix: `Fix`, `Feat`, `Refactor`, `Docs`, `Chore`.
Capture the PR number/URL that `gh pr create` prints — you need it for step 2.

## Steps 2–5 — record proof, upload, comment, announce

### Record the proof video

Launch the app and get the feature visible on the **primary monitor**, then
record:

```bash
# 1. In one shell: start the app and navigate to the feature.
npm run dev

# 2. In another: record the primary monitor for ~25s while you exercise the feature.
bash .claude/skills/pr-ready-sound/record-proof.sh /tmp/pr-proof.mp4 25
```

`record-proof.sh <out.mp4> [duration] [geometry]` captures the primary monitor by
default (auto-detected via `xrandr`). Pass an explicit `WxH+X+Y` geometry to
record just the app window. Tunables: `PROOF_FPS` (default 30),
`PROOF_COUNTDOWN` (seconds before recording starts, default 2).

### Upload + comment + announce (one command)

```bash
bash .claude/skills/pr-ready-sound/finish-pr.sh <pr-number-or-url> /tmp/pr-proof.mp4 "one-line summary"
```

`finish-pr.sh` does the rest end-to-end:

- Uploads the video to Dropbox via `upload-dropbox.js` → gets a public link.
- Posts the link as the first comment on the PR (`gh pr comment`).
- Plays the alarm and opens the PR in a new Firefox window.

If you only want the alert without a PR/video (e.g. user just says "ping me when
the PR is up"), call the sound script directly:

```bash
bash .claude/skills/pr-ready-sound/play-sound.sh "PR #123 ready — <title>" "<pr-url>"
```

## Dropbox setup (one-time)

The upload needs Dropbox credentials in a **gitignored** `.env`:

```bash
cp .claude/skills/pr-ready-sound/.env.example .claude/skills/pr-ready-sound/.env
# Fill in DROPBOX_APP_KEY + DROPBOX_APP_SECRET (see .env.example for the 2-min
# Dropbox app setup), then run the one-time OAuth:
node .claude/skills/pr-ready-sound/upload-dropbox.js --auth
```

`--auth` opens a browser, you approve, and a long-lived `DROPBOX_REFRESH_TOKEN`
is written back to `.env`. After that every upload is silent. (A short-lived
`DROPBOX_ACCESS_TOKEN` from the App Console also works for ad-hoc runs.)

## The alarm sound

`play-sound.sh` repeats a sound several times (default 4) so it's hard to miss.
It prefers a custom local file — `bruh.mp3` in this folder, or whatever
`PR_SOUND_FILE` points at — and falls back to a jarring system alarm, then a
synthesized siren, then the terminal bell. It also opens the PR URL (2nd arg) in
a new Firefox window.

Tunables: `PR_SOUND_REPEAT` (default 4), `PR_SOUND_GAP` (seconds, default 0.35),
`PR_SOUND_FILE` (custom sound path).

## Files in this skill

| File | Purpose |
|------|---------|
| `finish-pr.sh` | Orchestrates upload → comment → sound/Firefox for a created PR |
| `record-proof.sh` | Records a screen-capture proof video (ffmpeg x11grab) |
| `upload-dropbox.js` | Uploads one file to Dropbox, prints the public link; `--auth` flow |
| `play-sound.sh` | Plays the repeated alarm and opens the PR in Firefox |
| `preview-sounds.sh` | Auditions candidate system alert sounds |
| `.env.example` | Dropbox credential template (copy to `.env`, which is gitignored) |

## Notes / git hygiene

- `.env`, `*.mp4`/`*.webm` proof videos, and custom `*.mp3` sounds are
  **gitignored** — secrets and large media stay local; the skill still works for
  others via the system-alarm fallback and their own `.env`.
- The scripts are best-effort and never fail the surrounding task in normal use.
- Always also report the PR URL in your reply so the user has a clickable link
  alongside the audible alert and the opened window.
