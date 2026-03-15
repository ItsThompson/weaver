#!/bin/bash
# Session initialization tasks that run once on agentSpawn.
# Requires: HOOK_EVENT_NAME, CWD

run_init() {
  if [ "$HOOK_EVENT_NAME" != "agentSpawn" ]; then
    return
  fi

  local script_path="$0"
  if [ -L "$script_path" ]; then
    script_path="$(readlink "$script_path")"
  fi
  local hook_dir
  hook_dir="$(cd "$(dirname "$script_path")" && pwd)"

  local sync_script="$hook_dir/dist/sync-entry.mjs"
  [ -f "$sync_script" ] && node "$sync_script" --cwd "$CWD" 2>/dev/null || true
}
