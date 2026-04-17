#!/bin/bash
# Session management for pi: uses native session_id from event JSON.
# Sets SESSION_ID as a side effect.
# Requires: HOOK_EVENT_NAME, EVENT, CALLER_PID, WEAVER_DIR, LOGS_DIR, SESSIONS_FILE, CWD, TIMESTAMP

manage_session() {
  SESSION_ID=$(echo "$EVENT" | jq -r '.session_id // empty' 2>/dev/null || true)

  if [ -z "$SESSION_ID" ]; then
    SESSION_ID="orphan"
    return
  fi

  if [ "$HOOK_EVENT_NAME" = "session-start" ]; then
    local agent_name
    agent_name=$(ps -p "$CALLER_PID" -o args= 2>/dev/null \
      | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")

    local session_meta
    session_meta=$(jq -nc \
      --arg id "$SESSION_ID" \
      --argjson pid "$CALLER_PID" \
      --arg cwd "$CWD" \
      --arg ts "$TIMESTAMP" \
      --arg agent "$agent_name" \
      '{id:$id, pid:$pid, customName:null, cwd:$cwd, agentName:(if $agent == "" then null else $agent end), startTime:$ts, lastEventTime:$ts, harness:"pi"}')
    echo "$session_meta" >> "$SESSIONS_FILE"

    touch "$LOGS_DIR/$SESSION_ID.jsonl"
  fi
}
