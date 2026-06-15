# harnext-desktop

Desktop interface for the [harnext](https://www.harnext.dev) AI coding agent. Electron + React + TypeScript, with SQLite for local persistence.

## What it does

- **Onboarding** — first-run flow: theme (dark/light) → provider + API key → first project.
- **Projects** — add working directories; everything (agents, loops, diffs) is organized per project, with a recent-projects picker and a titlebar switcher.
- **Isolated worktrees** — for git projects every agent runs in its own `git worktree` on an `agent/<slug>` branch; your checkout is never touched. Review the live worktree diff, then **Approve & merge** or **Discard**.
- **Agents** — start one from the project home composer. Running agents appear in the left sidebar with live status (Working / Review / Needs input / Merged / Failed / Paused); click one to watch the conversation and tool calls stream.
- **Goal mode** — start a prompt with `/goal` to run the evaluator pattern: a smart model plans and reviews while an executor model writes the code, looping on REVISE verdicts.
- **Loops** — schedule recurring agent runs (interval / daily / weekly) per project, with run history, pause/resume and run-now.
- **Settings** — default + smart/executor models, provider keys, default editor (opens the agent's worktree), appearance.

## Architecture

```
src/main/                  Electron main process (ESM)
  db.ts                    better-sqlite3, schema migrations (projects, agents,
                           messages, tool_calls, file_changes)
  agents/agent-manager.ts  Map of live @harnext/core AgentSessions; maps agent
                           events to serializable DTOs; throttles text deltas (50ms)
  agents/diff-service.ts   snapshots files at tool start, unified diff at tool end
  ipc.ts                   ipcMain.handle commands; pushes 'agent:event' to renderer
src/preload/               typed contextBridge (window.api)
src/shared/types.ts        IPC contract shared by main/preload/renderer
src/renderer/              React app (HashRouter, zustand, Tailwind v4)
```

The agent backend embeds `@harnext/core` directly (multi-turn `AgentSession` with
`prompt()` / `subscribe()` / `abort()`), consumed as a `file:` dependency from the
harnext repo checked out at `../harnext`.

## Development

```bash
# 1. Build harnext core first (the file: dep consumes its dist/)
cd ../harnext && npm install && npm run build:core

# 2. Run the app
npm install
npm run dev
```

**After changing harnext core source**, re-run `npm run build:core` in the harnext
repo (or keep `npm -w packages/core run dev` watching) — the app loads `dist/`.

### Auth

API keys are resolved the same way as the harnext CLI: provider env vars
(`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, …) or stored keys in
`~/.harnext/agent/auth.json`. Log in once by running `harnext` in a terminal and
the desktop app inherits it.

### Notes

- `better-sqlite3` must be rebuilt for Electron's ABI; the `postinstall` script
  (`electron-builder install-app-deps`) handles it. If you see a
  `NODE_MODULE_VERSION` mismatch on startup, run `npx electron-builder install-app-deps`.
- Conversations persist in SQLite (`~/.config/harnext-desktop/harnext.db`) and replay
  after a restart, but core has no session-resume API yet — restored conversations are
  read-only; start a new chat to continue working.

## Packaging

For a distributable build, the `file:` dependency must be replaced with a packed
tarball (the symlink can't resolve harnext's node_modules once packaged):

```bash
cd ../harnext/packages/core && npm pack    # private blocks publish, not pack
cd -
npm i @harnext/core@../harnext/packages/core/harnext-core-<version>.tgz
npm run build:linux                        # or build:mac / build:win
```

## Releasing

Releases are built and published automatically by
[`.github/workflows/release.yml`](.github/workflows/release.yml) when a version
tag is pushed. A matrix of native runners (`macos-latest`, `windows-latest`,
`ubuntu-latest`) each builds its own installers — required because the native
`better-sqlite3` module is rebuilt per platform/arch — and electron-builder's
GitHub publisher uploads them to a Release for the tag:

| Runner | Script | Artifacts |
| --- | --- | --- |
| macOS | `build:mac` | `harnext-desktop-<version>.dmg` |
| Windows | `build:win` | `harnext-desktop-<version>-setup.exe` (NSIS) |
| Linux | `build:linux` | `harnext-desktop-<version>.AppImage`, `.snap`, `.deb` |

To cut a release:

```bash
npm version <patch|minor|major>   # bumps package.json and creates the matching git tag
git push --follow-tags            # pushes the commit and the vX.Y.Z tag → triggers the build
```

The workflow checks out `QualityUnit/harnext` as a sibling and builds
`@harnext/core` so the `file:../harnext/packages/core` dependency resolves (the
lint/test CI stub isn't sufficient for a real build). If that repo is private,
add a `HARNEXT_TOKEN` repository secret with read access; public repos use the
default token.

Notes / current limitations:

- Builds are **unsigned** — macOS has `notarize: false` and Windows isn't code-signed,
  so users see a Gatekeeper / SmartScreen warning. Signing needs an Apple Developer
  cert and a Windows code-signing cert as repo secrets (follow-up).
- Keep the git tag and `package.json` `version` in sync — `npm version` does this.
