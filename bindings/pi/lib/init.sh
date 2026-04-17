#!/bin/bash
# Session initialization tasks that run once on session-start.
# Requires: HOOK_EVENT_NAME

run_init() {
  if [ "$HOOK_EVENT_NAME" != "session-start" ]; then
    return
  fi
  # Pi extension handles integration natively. No config sync needed.
}
