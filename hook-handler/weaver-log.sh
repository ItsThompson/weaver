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

# Read hook event JSON from STDIN
EVENT=$(cat)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HOOK_EVENT_NAME=$(echo "$EVENT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)
CWD=$(echo "$EVENT" | grep -o '"cwd":"[^"]*"' | head -1 | cut -d'"' -f4)

# Walk up the process tree, skipping shell processes, to find the kiro-cli PID.
# In practice $PPID is already the kiro-cli PID (verified empirically), but this
# fallback handles cases where an intermediate shell is inserted.
get_caller_pid() {
  local pid="$PPID"
  local max_depth=5
  local depth=0

  while [ "$depth" -lt "$max_depth" ]; do
    local pname
    pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")

    case "$pname" in
      sh|bash|zsh|dash|fish|-bash|-zsh|-sh)
        local parent
        parent=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')
        if [ -z "$parent" ] || [ "$parent" = "1" ]; then
          break
        fi
        pid="$parent"
        depth=$((depth + 1))
        ;;
      *)
        break
        ;;
    esac
  done

  echo "$pid"
}

CALLER_PID=$(get_caller_pid)
SESSION_FILE="$WEAVER_DIR/.current-session-$CALLER_PID"

# Truncate tool_response.result values exceeding MAX_RESPONSE_LENGTH.
# Uses a simple approach: if the event contains tool_response, pipe through
# a truncation pass. This avoids pulling in jq as a dependency.
truncate_response() {
  local event="$1"
  local max_len="$MAX_RESPONSE_LENGTH"

  if echo "$event" | grep -q '"tool_response"'; then
    echo "$event" | awk -v max="$max_len" '{
      while (match($0, /"result":\["[^"]+"/)) {
        prefix = substr($0, 1, RSTART - 1)
        matched = substr($0, RSTART, RLENGTH)
        rest = substr($0, RSTART + RLENGTH)
        # offset past "result":[" (11 chars)
        content_start = 11
        content = substr(matched, content_start + 1, RLENGTH - content_start - 1)
        if (length(content) > max) {
          matched = substr(matched, 1, content_start + max) "...[truncated]\""
        }
        printf "%s%s", prefix, matched
        $0 = rest
      }
      print
    }'
  else
    echo "$event"
  fi
}

if [ "$HOOK_EVENT_NAME" = "agentSpawn" ]; then
  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  echo "$SESSION_ID" > "$SESSION_FILE"

  # Try to extract agent name from the kiro-cli process args (--agent <name>)
  AGENT_NAME=$(ps -p "$CALLER_PID" -o args= 2>/dev/null | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")
  AGENT_JSON="null"
  if [ -n "$AGENT_NAME" ]; then
    AGENT_JSON="\"$AGENT_NAME\""
  fi

  # Append session metadata to the index
  SESSION_META="{\"id\":\"$SESSION_ID\",\"pid\":$CALLER_PID,\"customName\":null,\"cwd\":\"$CWD\",\"agentName\":$AGENT_JSON,\"startTime\":\"$TIMESTAMP\",\"lastEventTime\":\"$TIMESTAMP\"}"
  echo "$SESSION_META" >> "$SESSIONS_FILE"

  # Create the per-session log file
  touch "$LOGS_DIR/$SESSION_ID.jsonl"
else
  if [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
  else
    SESSION_ID="orphan"
  fi
fi

# Truncate large tool responses before logging
EVENT=$(truncate_response "$EVENT")

# Build the log entry — include PID for orphan events so they can be grouped
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

exit 0
