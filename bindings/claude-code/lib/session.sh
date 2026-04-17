#!/bin/bash
# Session management for Claude Code: uses native session_id from event JSON.
# Sets SESSION_ID as a side effect.
# Requires: HOOK_EVENT_NAME, EVENT, CALLER_PID, WEAVER_DIR, LOGS_DIR, SESSIONS_FILE, CWD, TIMESTAMP

manage_session() {
  # Extract session_id from the event JSON
  SESSION_ID=$(echo "$EVENT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -z "$SESSION_ID" ]; then
    SESSION_ID="orphan"
    return
  fi

  if [ "$HOOK_EVENT_NAME" = "SessionStart" ]; then
    # Try to extract agent name from the claude process args (--agent <name>)
    local agent_name
    agent_name=$(ps -p "$CALLER_PID" -o args= 2>/dev/null | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")
    local agent_json="null"
    if [ -n "$agent_name" ]; then
      agent_json="\"$agent_name\""
    fi

    # Append session metadata to the index (dedup happens at read time)
    local session_meta="{\"id\":\"$SESSION_ID\",\"pid\":$CALLER_PID,\"customName\":null,\"cwd\":\"$CWD\",\"agentName\":$agent_json,\"startTime\":\"$TIMESTAMP\",\"lastEventTime\":\"$TIMESTAMP\",\"harness\":\"claude-code\"}"
    echo "$session_meta" >> "$SESSIONS_FILE"

    touch "$LOGS_DIR/$SESSION_ID.jsonl"
  fi
}
