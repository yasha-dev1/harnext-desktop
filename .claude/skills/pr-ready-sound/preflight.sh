#!/usr/bin/env bash
# Pre-flight verification gate for opening a PR (#157).
#
# The pr-ready-sound skill "owns the PR standard" but used to open PRs without
# running a single check — so a PR with a lint error, type error, format drift,
# or failing test could be opened (and, with no branch protection, merged). This
# runs those checks BEFORE `gh pr create` and exits non-zero on the first
# failure, naming the step that failed, so a bad change never reaches a PR.
#
# It runs the same checks CI runs (lint · format · tests) PLUS the full
# typecheck — which CI can't do because the main process needs @harnext/core's
# real types, present locally but stubbed in CI (#16/#138). So this gate is
# strictly stronger than CI for type errors.
#
# Usage:
#   bash .claude/skills/pr-ready-sound/preflight.sh            # run all gates
#   PREFLIGHT_SKIP="Typecheck" bash .../preflight.sh           # skip a named gate
#                                                              # (intentional override)
# Exit code 0 = safe to open the PR; non-zero = a gate failed (see stderr).

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || {
  echo "preflight: not inside a git repo" >&2
  exit 1
}

skip="${PREFLIGHT_SKIP:-}"

run() {
  local label="$1"
  shift
  case " $skip " in
    *" $label "*)
      printf '\n⏭  %s — SKIPPED (PREFLIGHT_SKIP)\n' "$label"
      return 0
      ;;
  esac
  printf '\n▶ %s\n' "$label"
  if "$@"; then
    printf '✓ %s passed\n' "$label"
  else
    printf '\n✗ PRE-FLIGHT FAILED at: %s\n' "$label" >&2
    printf '  Fix it before opening the PR (or set PREFLIGHT_SKIP="%s" to override deliberately).\n' \
      "$label" >&2
    exit 1
  fi
}

run "Lint" npm run lint
run "Format" npm run format:check
run "Typecheck" npm run typecheck
run "Tests" npm test

printf '\n✅ Pre-flight passed — safe to open the PR.\n'
printf '   Fill the PR body'\''s "## Testing" section from what actually ran:\n'
printf '   - lint · format · typecheck · unit tests (vitest) all green\n'
