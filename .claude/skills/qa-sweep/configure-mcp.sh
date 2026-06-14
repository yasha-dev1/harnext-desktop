#!/usr/bin/env bash
# Point (or unpoint) the global chrome-devtools MCP server at Electron's CDP
# endpoint so the MCP drives the real renderer instead of its own Chrome.
#   configure-mcp.sh            -> add  --browser-url=http://127.0.0.1:<port>
#   configure-mcp.sh --revert   -> remove the flag (back to default behavior)
# A backup of ~/.claude.json is written to ~/.claude.json.qa-bak.
# Requires reconnecting the MCP afterward (/mcp -> chrome-devtools -> Reconnect).
set -uo pipefail
PORT="${QA_CDP_PORT:-9222}"
URL="http://127.0.0.1:$PORT"
CONF="$HOME/.claude.json"
MODE="${1:-set}"

[ -f "$CONF" ] || { echo "✗ $CONF not found"; exit 1; }

python3 - "$CONF" "$URL" "$MODE" <<'PY'
import json, sys, shutil
conf, url, mode = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(conf))
srv = data.get("mcpServers", {}).get("chrome-devtools")
if not srv:
    print("✗ no global 'chrome-devtools' MCP server in", conf)
    print("  add one (type stdio, command npx, args [chrome-devtools-mcp@latest]) and retry.")
    sys.exit(1)
args = [a for a in srv.get("args", []) if not str(a).startswith("--browser-url")]
if mode != "--revert":
    args.append(f"--browser-url={url}")
srv["args"] = args
shutil.copy(conf, conf + ".qa-bak")
json.dump(data, open(conf, "w"), indent=2)
print("✓ chrome-devtools args ->", args)
print("  backup:", conf + ".qa-bak")
PY

echo "→ Reconnect MCP to apply: /mcp → chrome-devtools → Reconnect (or restart Claude Code)."
