#!/bin/bash
# Validation and injection dispatch for Claude Code.
# Delegates to the validation package's entry points with --harness claude-code.
# Requires: HOOK_EVENT_NAME, SESSION_ID, CWD, EVENT, ROOT_DIR

run_validation() {
  local validate_script="$ROOT_DIR/validation/dist/validate.mjs"
  local inject_script="$ROOT_DIR/validation/dist/inject.mjs"

  if [ "$HOOK_EVENT_NAME" = "UserPromptSubmit" ]; then
    [ -f "$inject_script" ] && node "$inject_script" --session-id "$SESSION_ID" 2>/dev/null || true
    return
  fi

  if [ "$HOOK_EVENT_NAME" != "Stop" ] && [ "$HOOK_EVENT_NAME" != "PostToolUse" ]; then
    return
  fi

  [ -f "$validate_script" ] || return 0

  local tool_name
  tool_name=$(echo "$EVENT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
  local tool_path
  tool_path=$(echo "$EVENT" | jq -r '.tool_input.path // .tool_input.file_path // empty' 2>/dev/null || echo "")
  local validate_exit=0
  local validate_stderr
  validate_stderr=$(node "$validate_script" \
    --harness claude-code \
    --session-id "$SESSION_ID" \
    --cwd "$CWD" \
    --trigger "$HOOK_EVENT_NAME" \
    --tool-name "$tool_name" \
    --tool-path "$tool_path" 2>&1 1>/dev/null) || validate_exit=$?

  if [ "$validate_exit" -ne 0 ] && echo "$validate_stderr" | grep -q "⚠ weaver:"; then
    echo "$validate_stderr" >&2
    exit "$validate_exit"
  fi
}
