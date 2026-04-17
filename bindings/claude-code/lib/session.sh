#!/bin/bash
# Session management for Claude Code: uses native session_id from event JSON.
# Sets SESSION_ID as a side effect.
# Requires: HOOK_EVENT_NAME, EVENT, CALLER_PID, WEAVER_DIR, LOGS_DIR, SESSIONS_FILE, CWD, TIMESTAMP

manage_session() {
  # Extract session_id from the event JSON (|| true to avoid pipefail on missing field)
  SESSION_ID=$(echo "$EVENT" | jq -r '.session_id // empty' 2>/dev/null || true)

  if [ -z "$SESSION_ID" ]; then
    SESSION_ID="orphan"
    return
  fi

  if [ "$HOOK_EVENT_NAME" = "SessionStart" ]; then
    # Extract agent name from the claude process args (--agent <name>).
    # Assumes --agent value is a single token with no spaces. This is safe
    # today because agent names are filesystem-derived identifiers.
    local agent_name
    agent_name=$(ps -p "$CALLER_PID" -o args= 2>/dev/null | grep -o '\-\-agent [^ ]*' | awk '{print $2}' || echo "")

    # Build session metadata with jq to handle escaping of cwd/agent values
    local session_meta
    session_meta=$(jq -nc \
      --arg id "$SESSION_ID" \
      --argjson pid "$CALLER_PID" \
      --arg cwd "$CWD" \
      --arg ts "$TIMESTAMP" \
      --arg agent "$agent_name" \
      '{id:$id, pid:$pid, customName:null, cwd:$cwd, agentName:(if $agent == "" then null else $agent end), startTime:$ts, lastEventTime:$ts, harness:"claude-code"}')
    echo "$session_meta" >> "$SESSIONS_FILE"

    touch "$LOGS_DIR/$SESSION_ID.jsonl"
  fi
}
