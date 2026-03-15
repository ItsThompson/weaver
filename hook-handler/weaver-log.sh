#!/bin/bash
set -euo pipefail

# Weaver logging hook for kiro-cli.
# Captures hook events from stdin and writes them to local files in ~/.weaver/.
# Creates session metadata and per-session event logs that the weaver dashboard reads.
# Does not communicate with the weaver server - only writes to disk.

WEAVER_DIR="$HOME/.weaver"
LOGS_DIR="$WEAVER_DIR/logs"
SESSIONS_FILE="$WEAVER_DIR/sessions.jsonl"
MAX_RESPONSE_LENGTH="${WEAVER_MAX_RESPONSE_LENGTH:-500}"
WEAVER_SERVER="${WEAVER_SERVER:-http://localhost:8143}"

mkdir -p "$LOGS_DIR"

# Resolve lib directory (follow symlinks)
SCRIPT_PATH="$0"
if [ -L "$SCRIPT_PATH" ]; then
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
fi
LIB_DIR="$(cd "$(dirname "$SCRIPT_PATH")/lib" && pwd)"

source "$LIB_DIR/pid.sh"
source "$LIB_DIR/truncate.sh"
source "$LIB_DIR/session.sh"
source "$LIB_DIR/validate.sh"
source "$LIB_DIR/init.sh"

# Read hook event JSON from STDIN
EVENT=$(cat)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HOOK_EVENT_NAME=$(echo "$EVENT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)
CWD=$(echo "$EVENT" | grep -o '"cwd":"[^"]*"' | head -1 | cut -d'"' -f4)

CALLER_PID=$(get_caller_pid)
manage_session

# Truncate large tool responses before logging
EVENT=$(truncate_response "$EVENT")

# Write log entry
if [ "$SESSION_ID" = "orphan" ]; then
  echo "{\"timestamp\":\"$TIMESTAMP\",\"pid\":$CALLER_PID,\"event\":$EVENT}" >> "$LOGS_DIR/orphan.jsonl"
else
  echo "{\"timestamp\":\"$TIMESTAMP\",\"event\":$EVENT}" >> "$LOGS_DIR/$SESSION_ID.jsonl"
fi

# Notify weaver server of the update (fire-and-forget, async background)
curl -s --max-time 1 -X POST "$WEAVER_SERVER/api/notify" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"eventName\":\"$HOOK_EVENT_NAME\"}" >/dev/null 2>&1 &

if [ "$SESSION_ID" = "orphan" ]; then
  echo "weaver: no session found for PID $CALLER_PID — event logged to orphan queue" >&2
  exit 1
fi

run_init
run_validation

exit 0
