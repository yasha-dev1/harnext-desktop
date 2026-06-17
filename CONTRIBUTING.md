# Contributing to harnext-desktop

Thanks for contributing! This guide covers the local setup, the checks every
change must pass, and the PR standard — the pipeline enforcement tracked in #148.

## Setup

```bash
npm install            # installs deps (postinstall rebuilds native better-sqlite3 for Electron)
npm run dev            # run the app (electron-vite)
```

`@harnext/core` is a local sibling package (`file:../harnext/packages/core`).
You need it checked out next to this repo for typecheck/build/dev to resolve.

## The checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint over the repo |
| `npm run format:check` | Prettier formatting check (`npm run format` to fix) |
| `npm run typecheck` | `tsc` for both the main (`node`) and renderer (`web`) projects |
| `npm test` | Vitest unit/integration suite |

CI (`.github/workflows/ci.yml`) runs lint · format · renderer-typecheck · tests
on **Ubuntu, macOS, and Windows**. The main-process typecheck can't run in CI yet
(it needs `@harnext/core`'s real types, which are stubbed on CI — see #16/#138),
so **run the full `npm run typecheck` locally** before pushing.

## Before you open a PR — the pre-flight gate

The `pr-ready-sound` skill owns the PR standard and **must not open a PR that
fails the checks** (#157). Run the gate first:

```bash
bash .claude/skills/pr-ready-sound/preflight.sh
```

It runs lint · format · full typecheck · tests and stops on the first failure.
Only open the PR when it passes, and fill the PR template's **Testing** section
from what actually ran.

## Commit-time hook (optional but recommended)

Enable the repo's git hooks to catch lint/format issues before they're committed:

```bash
git config core.hooksPath .githooks
```

`.githooks/pre-commit` runs the fast checks (lint + format). The heavier
typecheck + tests run in the pre-flight gate at PR time and in CI.

## Pull requests

- Branch off the latest `origin/main` (`<type>/<slug>`, e.g. `fix/compose-empty-start`).
  Never commit to `main` directly.
- Use a conventional title prefix: `Feat` / `Fix` / `Refactor` / `Docs` / `Chore`.
- Fill the PR template (Summary · Changes · Testing · Notes); attach proof
  (screenshot/video) for user-facing changes.
- Keep PRs focused; note anything deliberately left out of scope.

## Repository settings (maintainer action)

Branch protection on `main` — require the CI check to pass and a review before
merge — must be enabled by a repo admin in GitHub settings; it can't be set from
a PR. This is the remaining half of #148 once these templates land.
