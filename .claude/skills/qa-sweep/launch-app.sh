#!/usr/bin/env bash
# Launch harnext-desktop with a CDP remote-debugging port so the chrome-devtools
# MCP can drive the real Electron renderer (window.api / IPC intact).
# Returns once CDP answers (first run builds + boots: up to ~90s). Leaves the app
# running detached; stop it with stop-app.sh.
set -uo pipefail

PORT="${QA_CDP_PORT:-9222}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"   # .claude/skills/qa-sweep -> project root
LOG="${QA_APP_LOG:-/tmp/harnext-qa-app.log}"
PIDFILE="/tmp/harnext-qa-app.pid"
CORE_DIST="$ROOT/../harnext/packages/core/dist"

cdp_up() { curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; }

if cdp_up; then
  echo "✓ CDP already listening on :$PORT — reusing the running instance"
  exit 0
fi

# 1. Ensure @harnext/core is built (the file: dep consumes its dist/).
if [ ! -d "$CORE_DIST" ]; then
  if [ -d "$ROOT/../harnext" ]; then
    echo "• Building @harnext/core (dist missing)…"
    ( cd "$ROOT/../harnext" && npm run build:core ) || { echo "✗ build:core failed"; exit 1; }
  else
    echo "✗ ../harnext not found and core dist missing — cannot run the app"; exit 1
  fi
fi

# 2. Launch dev server + electron with the debug port, detached.
echo "• Launching: electron-vite dev --remoteDebuggingPort $PORT  (logs: $LOG)"
cd "$ROOT"
: > "$LOG"
nohup npm run dev -- --remoteDebuggingPort "$PORT" >>"$LOG" 2>&1 &
echo $! > "$PIDFILE"

# 3. Wait for CDP, bailing early on a hard startup crash.
for i in $(seq 1 90); do
  if cdp_up; then
    echo "✓ CDP listening on http://127.0.0.1:$PORT (after ${i}s)"
    echo "  next: bash $(dirname "${BASH_SOURCE[0]}")/cdp.sh   then MCP list_pages/select_page"
    exit 0
  fi
  if grep -qiE "NODE_MODULE_VERSION|Cannot find module|A JavaScript error occurred in the main process|app threw an error" "$LOG"; then
    echo "✗ App crashed on startup. Tail of $LOG:"; tail -n 25 "$LOG"
    echo "   (NODE_MODULE_VERSION? rebuild native deps: npx electron-builder install-app-deps)"
    exit 1
  fi
  sleep 1
done
echo "✗ CDP did not come up within 90s. Tail of $LOG:"; tail -n 25 "$LOG"
exit 1
