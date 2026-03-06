#!/bin/bash
set -euo pipefail

# Weaver hook for kiro-cli.
# Lightweight signal mechanism: creates PID marker files and notifies the weaver server.
# The ACP client handles full persistence via SQLite — this hook is retained for
# PID tracking and as a fallback for non-weaver sessions (kiro-cli chat directly).

WEAVER_DIR="$HOME/.weaver"
WEAVER_SERVER="${WEAVER_SERVER:-http://localhost:8143}"

mkdir -p "$WEAVER_DIR"

# Read hook event JSON from STDIN
EVENT=$(cat)
HOOK_EVENT_NAME=$(echo "$EVENT" | grep -o '"hook_event_name":"[^"]*"' | head -1 | cut -d'"' -f4)

# Walk up the process tree, skipping shell processes, to find the kiro-cli PID.
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

if [ "$HOOK_EVENT_NAME" = "agentSpawn" ]; then
  # Write marker file for PID tracking
  echo "$CALLER_PID" > "$SESSION_FILE"
fi

# Determine session identifier for notify — use marker file existence to detect orphans
SESSION_ID=""
if [ -f "$SESSION_FILE" ]; then
  SESSION_ID="hook-$CALLER_PID"
else
  echo "weaver: no session found for PID $CALLER_PID — event not tracked" >&2
  exit 1
fi

# Notify weaver server of the update (fire-and-forget, async background)
curl -s --max-time 1 -X POST "$WEAVER_SERVER/api/notify" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"eventName\":\"$HOOK_EVENT_NAME\"}" >/dev/null 2>&1 &

exit 0
