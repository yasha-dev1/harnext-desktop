#!/usr/bin/env bash
# Show the CDP browser info and page targets exposed by the running app.
# Use this to confirm Electron's debug port is up and find the renderer page.
set -uo pipefail
PORT="${QA_CDP_PORT:-9222}"

if ! curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "✗ no CDP on :$PORT — run launch-app.sh first"; exit 1
fi

echo "=== browser ==="
curl -s "http://127.0.0.1:$PORT/json/version"
echo; echo "=== page targets ==="
curl -s "http://127.0.0.1:$PORT/json" | python3 - <<'PY'
import sys, json
try:
    targets = json.load(sys.stdin)
except Exception as e:
    print("(could not parse /json:", e, ")"); sys.exit(0)
pages = [t for t in targets if t.get("type") == "page"]
if not pages:
    print("(no page targets — renderer may still be loading)")
for t in pages:
    print(f"- title: {t.get('title','')!r}")
    print(f"  url:   {t.get('url')}")
    print(f"  ws:    {t.get('webSocketDebuggerUrl')}")
PY
echo
echo "→ In the chrome-devtools MCP: list_pages, then select_page the harnext renderer."
