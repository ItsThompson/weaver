#!/bin/bash
# Session initialization tasks that run once on SessionStart.
# Requires: HOOK_EVENT_NAME, CWD, BINDING_DIR

run_init() {
  if [ "$HOOK_EVENT_NAME" != "SessionStart" ]; then
    return
  fi

  local sync_script="$BINDING_DIR/dist/sync-entry.mjs"
  [ -f "$sync_script" ] && node "$sync_script" --cwd "$CWD" 2>/dev/null || true
}
