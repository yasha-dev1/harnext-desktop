---
name: qa-sweep
description: Exhaustively QA-test the harnext-desktop Electron app to find functional bugs and UI/UX issues. Launches the real app with a CDP remote-debugging port, drives the actual renderer through the chrome-devtools MCP (clicking, typing, navigating across onboarding, projects, agents, goal mode, loops, settings, worktree diffs, image attachments, reasoning-effort selection, branch switching, steering a running agent, resuming an ended conversation, base-branch selection, and the MCP connector), watches console + network for errors, captures screenshots, and writes a structured bug/UX report. Use when asked to "test the app", "find bugs", "do a QA pass", "check everything works", "hunt for UX issues", or verify the whole app end-to-end (broader than the built-in `verify`/`run` skills, which target one change).
---

# QA Sweep — drive the app, find bugs & UX issues

Goal: act as a thorough QA engineer. Exercise every user-facing scenario in the
real running app, surface anything broken or rough, and hand back a prioritized,
reproducible report — **functional bugs** (crashes, broken flows, data loss,
console/IPC errors) **and** **UI/UX issues** (confusing copy, missing states,
bad layout, weak accessibility, awkward interactions).

This app is Electron: the React renderer talks to the main process exclusively
through `window.api` (the preload IPC bridge). A plain browser tab has no
`window.api`, so the app only works inside Electron. Therefore we drive the
**real Electron renderer** over a Chrome DevTools Protocol (CDP) port — not a
standalone Chrome.

## The toolchain (how driving works)

```
electron-vite dev --remoteDebuggingPort 9222   →  Electron exposes CDP on :9222
chrome-devtools MCP  --browser-url=:9222        →  drives the real renderer
   take_snapshot / click / fill / hover / navigate_page / take_screenshot
   list_console_messages / list_network_requests / evaluate_script
```

All helper scripts live in this skill folder. Run them with bash.

## Setup (do this once per sweep)

1. **Stop any already-running app instance** that isn't using the debug port
   (it would contend on the same SQLite DB). If `~/.config/harnext-desktop` is
   actively in use and `cdp.sh` later shows no `:9222`, close the app first.

2. **Point chrome-devtools MCP at Electron.** The global `chrome-devtools` MCP
   server launches its own Chrome by default; it must connect to Electron's CDP
   instead:

   ```bash
   bash .claude/skills/qa-sweep/configure-mcp.sh        # adds --browser-url=:9222
   ```

   Then **reconnect the MCP** so it picks up the new arg: run `/mcp`, select
   `chrome-devtools`, **Reconnect** (or restart Claude Code). This is a one-time
   change; revert it any time with `configure-mcp.sh --revert` (a backup of
   `~/.claude.json` is written either way). While pointed at Electron, normal web
   browsing via chrome-devtools needs the app running on `:9222`.

   > If the MCP is already configured for `:9222` (e.g. from a prior sweep), skip
   > this — `list_pages` showing a `harnext` renderer page confirms it.

3. **Launch the app with the debug port:**

   ```bash
   bash .claude/skills/qa-sweep/launch-app.sh
   ```

   It builds `@harnext/core` if its `dist/` is missing, starts
   `electron-vite dev --remoteDebuggingPort 9222` detached (logs to
   `/tmp/harnext-qa-app.log`, pid in `/tmp/harnext-qa-app.pid`), and waits until
   CDP answers. First run can take ~60–90s. If it reports a `NODE_MODULE_VERSION`
   crash, run `npx electron-builder install-app-deps` and relaunch.

4. **Confirm the renderer target is reachable:**

   ```bash
   bash .claude/skills/qa-sweep/cdp.sh    # lists CDP page targets
   ```

   Then via MCP: `list_pages` → `select_page` the harnext renderer (the `page`
   target whose URL is the Vite dev server, not a devtools/blob page). Do a
   `take_snapshot` — you should see the real UI (titlebar, onboarding, or a
   project view).

### Clean first-run testing (optional)

To test onboarding from scratch you need an empty DB. The DB is locked while the
app runs, so: **stop the app → reset → relaunch.**

```bash
bash .claude/skills/qa-sweep/stop-app.sh
bash .claude/skills/qa-sweep/reset-state.sh backup   # safety copy
bash .claude/skills/qa-sweep/reset-state.sh reset    # next launch = fresh onboarding
bash .claude/skills/qa-sweep/launch-app.sh
# …test onboarding…
bash .claude/skills/qa-sweep/stop-app.sh
bash .claude/skills/qa-sweep/reset-state.sh restore  # bring the real DB back
```

### Alternative: drive without the MCP (direct CDP) — no reconnect needed

If you can't reconnect the chrome-devtools MCP (e.g. unattended/loop runs), drive
Electron's CDP port directly with a tiny Node client. This is the **proven
fallback** and avoids touching the user's running app or data:

1. **Launch the built app off-screen, isolated.** If this checkout's Electron
   binary isn't installed (`node_modules/electron/path.txt` empty), reuse another
   checkout's identical-version binary. Use `xvfb` so no window appears, and an
   isolated `--user-data-dir` (fresh DB → clean onboarding, no contention with a
   running instance):

   ```bash
   npm run build   # ensure out/ is current
   xvfb-run -a <electron-binary> <app-dir> \
     --remote-debugging-port=9222 --user-data-dir=/tmp/qa-userdata-fresh \
     --no-sandbox --disable-gpu
   ```
   Run it with the Bash tool's `run_in_background: true` (not `nohup &`). Poll
   `curl http://127.0.0.1:9222/json/version` until it answers.

2. **Install a CDP client once:** `npm install --prefix /tmp/qa-cdp chrome-remote-interface`

3. **Drive + inspect:**
   ```bash
   NODE_PATH=/tmp/qa-cdp/node_modules node .claude/skills/qa-sweep/cdp-drive.mjs
   ```
   `cdp-drive.mjs` reloads the app, walks onboarding, screenshots each step into
   `qa-reports/assets/`, and reports console errors / exceptions / failed
   requests + assertions as JSON. Extend it per scenario: `Runtime.evaluate`
   (use `awaitPromise:true` for `window.api.*` promises — pass the promise
   expression, **not** an `await` keyword), click via
   `querySelector().click()`, navigate via `location.hash`, screenshot via
   `Page.captureScreenshot`. Inject a scratch project with
   `window.api.projects.create('/tmp/qa-scratch')` to bypass the native dir
   dialog and reach the project views.

## How to drive & observe

Read `scenarios.md` (in this folder) for the full scenario catalog. Work through
it methodically. For each step:

- **Act** with the chrome-devtools MCP. Prefer `take_snapshot` (accessibility
  tree with element `uid`s) to find targets, then `click` / `fill` / `hover` /
  `press_key` / `navigate_page` by uid. `take_screenshot` for visual evidence.
  This app uses a **frameless window** (`frame:false`) with a custom titlebar —
  test the drag region and the min/maximize/close buttons too.
- **Observe after every meaningful interaction** — these are your primary bug
  signals in an Electron renderer:
  - `list_console_messages` → any `error`/`warning`, React warnings (keys,
    act()), unhandled promise rejections, or **IPC errors** surfaced from the
    main process. Steady state should be clean.
  - `list_network_requests` → failed, 4xx, 5xx, or hung requests (provider API,
    assets).
  - `evaluate_script` to inspect deeper: read `window.api` results, zustand store
    state, DOM, computed styles (contrast/overflow), focus, element counts.
- **Look for UX/UI issues**, not just crashes: missing loading/empty/error
  states, buttons that do nothing, no feedback on success, confusing or
  inconsistent copy, layout breaks at the min window size (940×600) or when
  content is long, focus traps, icon-only buttons without labels, theme/contrast
  problems, off cadence/relative-time text, double-submit on rapid clicks.
- **Test both themes.** Toggle dark/light (Settings or onboarding) and re-check
  key views; theme is applied via `document.documentElement.dataset.appearance`.

### Be careful with destructive / costly actions

Starting an agent makes **real provider API calls** (spends tokens) and, for git
projects, creates a **git worktree** on an `agent/<slug>` branch; **merge**
writes to your checkout; **discard**/**remove project**/**delete loop** destroy
data. Guidance:

- Prefer a **throwaway scratch git repo** as the test project (e.g.
  `git init /tmp/qa-scratch && (cd /tmp/qa-scratch && git commit --allow-empty -m init)`).
  Never sign off real work as a test target.
- You can exercise most UI, validation, and error paths (empty prompt, missing
  key, `/goal` toggle, model/permission selects, navigation, loops forms) without
  completing a real agent run. When you do run one, keep the prompt tiny and
  abort early; verify the running → review/input → merge/discard transitions.
- Confirm before any merge into a real repo. Record, don't perform, anything
  you're unsure about.

## Triage every finding

Classify and rate each issue:

- **Category:** `Bug` (functional/crash/data) · `UX` (usability/visual/copy/a11y)
  · `Enhancement` (feature improvement / missing capability the user asked about).
- **Severity:** `Critical` (crash, data loss, core flow blocked) · `High` (a
  feature is broken/unusable) · `Medium` (works but wrong/confusing) · `Low`
  (polish, minor copy/visual).
- **Dedup** repeats; group related symptoms under one root cause when clear.
- Prefer **confirmed, reproducible** findings: give exact steps, and where you
  can, point at the likely source file/line (the renderer lives in
  `src/renderer/src/`, IPC contract in `src/shared/types.ts`, main in `src/main/`).

## Output

Write a report to `qa-reports/qa-<YYYY-MM-DD>.md` (create the folder) using
`report-template.md` in this folder as the structure. Each finding gets: id,
title, category, severity, scenario, steps to reproduce, expected vs actual,
evidence (screenshot path + console/network excerpt), and a suggested fix or
file pointer. End with a short summary table (counts by severity) and a list of
scenarios that passed clean. Then give the user a concise top-of-report summary
in chat with the highest-severity items first.

## Teardown

```bash
bash .claude/skills/qa-sweep/stop-app.sh
bash .claude/skills/qa-sweep/reset-state.sh restore   # if you reset the DB
# bash .claude/skills/qa-sweep/configure-mcp.sh --revert  # if restoring default chrome-devtools
```

## Notes

- Scripts honor `QA_CDP_PORT` (default `9222`) if `:9222` is taken.
- The app log is `/tmp/harnext-qa-app.log` — tail it when the UI misbehaves;
  main-process errors and stack traces land there, not in the renderer console.
- Conversations persist in SQLite and replay read-only after a restart (core has
  no resume API yet) — expect restored chats to be non-interactive; that's known,
  not a bug.
