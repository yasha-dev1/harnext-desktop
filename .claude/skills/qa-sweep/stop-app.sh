#!/usr/bin/env bash
# Stop the QA app instance started by launch-app.sh.
set -uo pipefail
PORT="${QA_CDP_PORT:-9222}"
PIDFILE="/tmp/harnext-qa-app.pid"

if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "${PID:-}" ]; then
    pkill -P "$PID" 2>/dev/null || true
    kill "$PID" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
fi

# Fallbacks: kill the electron bound to our debug port and the dev runner.
pkill -f "remote-debugging-port=$PORT" 2>/dev/null || true
pkill -f "remoteDebuggingPort $PORT"   2>/dev/null || true
pkill -f "electron-vite dev"           2>/dev/null || true

echo "✓ app stopped (port $PORT)"
