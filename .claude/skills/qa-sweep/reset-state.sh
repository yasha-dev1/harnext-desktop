#!/usr/bin/env bash
# Manage the app's SQLite DB so onboarding/first-run can be tested clean.
# The DB is locked while the app runs — STOP the app before reset/restore.
#   reset-state.sh backup    -> safety copy of the current DB
#   reset-state.sh reset     -> move DB aside; next launch starts at onboarding
#   reset-state.sh restore   -> bring the saved DB back
set -uo pipefail
DIR="$HOME/.config/harnext-desktop"
FILES=(harnext.db harnext.db-wal harnext.db-shm)

case "${1:-}" in
  backup)
    if [ -f "$DIR/harnext.db" ]; then
      cp "$DIR/harnext.db" "$DIR/harnext.db.qa-bak"
      echo "✓ backed up -> $DIR/harnext.db.qa-bak"
    else
      echo "• no DB at $DIR/harnext.db to back up"
    fi
    ;;
  reset)
    for f in "${FILES[@]}"; do
      [ -f "$DIR/$f" ] && mv "$DIR/$f" "$DIR/$f.qa-saved" && echo "• moved $f aside"
    done
    echo "✓ next launch starts fresh at onboarding (undo: reset-state.sh restore)"
    ;;
  restore)
    for f in "${FILES[@]}"; do
      [ -f "$DIR/$f.qa-saved" ] && mv -f "$DIR/$f.qa-saved" "$DIR/$f" && echo "• restored $f"
    done
    echo "✓ restore done"
    ;;
  *)
    echo "usage: reset-state.sh backup|reset|restore"; exit 1;;
esac
