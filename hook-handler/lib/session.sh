#!/bin/bash
# Session management: create on agentSpawn, lookup for all other events.
# Sets SESSION_ID as a side effect.
# Requires: HOOK_EVENT_NAME, CALLER_PID, WEAVER_DIR, LOGS_DIR, SESSIONS_FILE, CWD, TIMESTAMP

manage_session() {
  local session_file="$WEAVER_DIR/.current-session-$CALLER_PID"

  if [ "$HOOK_EVENT_NAME" = "agentSpawn" ]; then
    SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
    echo "$SESSION_ID" > "$session_file"

    # Try to extract agent name from the kiro-cli process args (--agent <name>)
    local agent_name
    agent_name=$(ps -p "$CALLER_PID" -o args= 2>/dev/null | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")
    local agent_json="null"
    if [ -n "$agent_name" ]; then
      agent_json="\"$agent_name\""
    fi

    # Append session metadata to the index
    local session_meta="{\"id\":\"$SESSION_ID\",\"pid\":$CALLER_PID,\"customName\":null,\"cwd\":\"$CWD\",\"agentName\":$agent_json,\"startTime\":\"$TIMESTAMP\",\"lastEventTime\":\"$TIMESTAMP\"}"
    echo "$session_meta" >> "$SESSIONS_FILE"

    touch "$LOGS_DIR/$SESSION_ID.jsonl"
  else
    if [ -f "$session_file" ]; then
      SESSION_ID=$(cat "$session_file")
    else
      SESSION_ID="orphan"
    fi
  fi
}
