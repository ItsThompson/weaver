#!/bin/bash
set -euo pipefail

# Weaver logging hook for Claude Code.
# Captures hook events from stdin, manages sessions, and dispatches to:
#   1. log-event.mjs (fire-and-forget): writes canonical WeaverEvent to JSONL, notifies server
#   2. validate.mjs (blocking): runs validation commands, returns exit code to harness

WEAVER_DIR="$HOME/.weaver"
LOGS_DIR="$WEAVER_DIR/logs"
SESSIONS_FILE="$WEAVER_DIR/sessions.jsonl"
MAX_RESPONSE_LENGTH="${WEAVER_MAX_RESPONSE_LENGTH:-500}"

mkdir -p "$LOGS_DIR"

# Resolve binding directory (follow symlinks)
SCRIPT_PATH="$0"
if [ -L "$SCRIPT_PATH" ]; then
  SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH" 2>/dev/null || perl -MCwd -e 'print Cwd::abs_path shift' "$SCRIPT_PATH")"
fi
BINDING_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
ROOT_DIR="$(cd "$BINDING_DIR/../.." && pwd)"
LIB_DIR="$BINDING_DIR/lib"

source "$LIB_DIR/pid.sh"
source "$LIB_DIR/truncate.sh"
source "$LIB_DIR/session.sh"
source "$LIB_DIR/validate.sh"
source "$LIB_DIR/init.sh"

# Extract a top-level string field from a JSON blob.
# Falls back to regex when jq is unavailable. Returns empty string if field is missing.
json_field() {
  local json="$1" field="$2"
  local val=""
  val=$(echo "$json" | jq -r --arg f "$field" '.[$f] // empty' 2>/dev/null) || true
  if [ -n "$val" ]; then
    echo "$val"
    return
  fi
  echo "$json" | grep -o "\"$field\":\"[^\"]*\"" | head -1 | cut -d'"' -f4 || true
}

# Read hook event JSON from STDIN
EVENT=$(cat)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HOOK_EVENT_NAME=$(json_field "$EVENT" "hook_event_name")
CWD=$(json_field "$EVENT" "cwd")

CALLER_PID=$(get_caller_pid)
# Default to 0 if PID is non-numeric (e.g., ps unavailable in container)
case "$CALLER_PID" in
  ''|*[!0-9]*) CALLER_PID=0 ;;
esac
manage_session

# Truncate large tool responses before logging
EVENT=$(truncate_response "$EVENT")

# Fire-and-forget: write canonical WeaverEvent and notify server
local_log_event="$BINDING_DIR/dist/log-event.mjs"
if [ -f "$local_log_event" ]; then
  echo "$EVENT" | node "$local_log_event" --session-id "$SESSION_ID" --pid "$CALLER_PID" &
  LOG_PID=$!
fi

if [ "$SESSION_ID" = "orphan" ]; then
  # Wait for log-event to finish writing before exiting
  [ -n "${LOG_PID:-}" ] && wait "$LOG_PID" 2>/dev/null || true
  echo "weaver: no session_id in event payload: event logged to orphan queue" >&2
  exit 0
fi

run_init
run_validation

exit 0
