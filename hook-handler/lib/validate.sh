#!/bin/bash
# Validation and injection dispatch.
# Requires: HOOK_EVENT_NAME, SESSION_ID, CWD, EVENT

run_validation() {
  local script_path="$0"
  if [ -L "$script_path" ]; then
    script_path="$(readlink "$script_path")"
  fi
  local hook_dir
  hook_dir="$(cd "$(dirname "$script_path")" && pwd)"
  local validate_script="$hook_dir/dist/validate.mjs"
  local inject_script="$hook_dir/dist/inject.mjs"

  if [ "$HOOK_EVENT_NAME" = "stop" ] || [ "$HOOK_EVENT_NAME" = "postToolUse" ]; then
    if [ -f "$validate_script" ]; then
      local tool_name
      tool_name=$(echo "$EVENT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
      # Extract tool_input.path via jq — passing full $EVENT as a CLI arg corrupts
      # backslashes in code fields (new_str/old_str), breaking JSON.parse in Node.
      local tool_path
      tool_path=$(echo "$EVENT" | jq -r '.tool_input.path // empty' 2>/dev/null || echo "")
      local validate_exit=0
      local validate_stderr
      validate_stderr=$(node "$validate_script" \
        --session-id "$SESSION_ID" \
        --cwd "$CWD" \
        --trigger "$HOOK_EVENT_NAME" \
        --tool-name "$tool_name" \
        --tool-path "$tool_path" 2>&1 1>/dev/null) || validate_exit=$?
      if [ "$validate_exit" -ne 0 ] && echo "$validate_stderr" | grep -q "⚠ weaver:"; then
        echo "$validate_stderr" >&2
        exit "$validate_exit"
      fi
    fi
  fi

  if [ "$HOOK_EVENT_NAME" = "userPromptSubmit" ]; then
    if [ -f "$inject_script" ]; then
      node "$inject_script" --session-id "$SESSION_ID" 2>/dev/null || true
    fi
  fi
}
