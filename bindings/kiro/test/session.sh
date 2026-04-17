#!/bin/bash
# Session lifecycle tests: spawn, subsequent events, orphan handling.
# Uses a temp copy of the binding with a mock log-event.mjs that writes
# the raw event to the session JSONL (simulating the real entry point).

setup_session() {
  setup
  SESSION_TMP=$(mktemp -d)
  cp "$HOOK" "$SESSION_TMP/weaver-log.sh"
  chmod +x "$SESSION_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$SESSION_TMP/lib"
  mkdir -p "$SESSION_TMP/dist"
  # Mock log-event.mjs: write the raw event as a JSONL line to the session log
  cat > "$SESSION_TMP/dist/log-event.mjs" << 'MOCK'
import { readFileSync, appendFileSync } from "node:fs";
const sidIdx = process.argv.indexOf("--session-id");
const sid = sidIdx !== -1 ? process.argv[sidIdx + 1] : "orphan";
const pidIdx = process.argv.indexOf("--pid");
const pid = pidIdx !== -1 ? process.argv[pidIdx + 1] : "0";
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const raw = Buffer.concat(chunks).toString();
  const event = JSON.parse(raw);
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), sessionId: sid, pid: Number(pid), eventName: event.hook_event_name, cwd: event.cwd, prompt: event.prompt });
  const dir = process.env.HOME + "/.weaver/logs";
  const path = sid === "orphan" ? dir + "/orphan.jsonl" : dir + "/" + sid + ".jsonl";
  appendFileSync(path, entry + "\n");
});
MOCK
  SHOOK="$SESSION_TMP/weaver-log.sh"
}

teardown_session() {
  teardown
  rm -rf "$SESSION_TMP"
}

test_agent_spawn_creates_session() {
  echo "test: agentSpawn creates session index entry and log file"
  setup_session

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$SHOOK"
  # Give fire-and-forget log-event.mjs time to write
  sleep 0.3

  local sessions_file="$HOME/.weaver/sessions.jsonl"
  assert_file_exists "sessions.jsonl created" "$sessions_file"

  local line
  line=$(cat "$sessions_file")
  assert_contains "has session id" '"id":' "$line"
  assert_contains "has pid" '"pid":' "$line"
  assert_contains "has cwd" '"/tmp/project"' "$line"
  assert_contains "has customName null" '"customName":null' "$line"

  local session_id
  session_id=$(echo "$line" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  assert_file_exists "log file created" "$HOME/.weaver/logs/$session_id.jsonl"

  local log_line
  log_line=$(cat "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "log has timestamp" '"timestamp":' "$log_line"
  assert_contains "log has agentSpawn" '"agentSpawn"' "$log_line"

  teardown_session
}

test_subsequent_events_append_to_session_log() {
  echo "test: subsequent events append to existing session log"
  setup_session

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$SHOOK"
  sleep 0.3

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"hello world"}' | bash "$SHOOK"
  sleep 0.3

  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  local last_line
  last_line=$(tail -1 "$log_file")
  assert_contains "log has prompt event" '"userPromptSubmit"' "$last_line"
  assert_contains "log has prompt text" '"hello world"' "$last_line"

  teardown_session
}

test_orphan_session_when_no_spawn() {
  echo "test: events without agentSpawn go to orphan log"
  setup_session

  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"orphan"}' | bash "$SHOOK" 2>&1 1>/dev/null || true)
  sleep 0.3

  assert_file_exists "orphan log created" "$HOME/.weaver/logs/orphan.jsonl"

  local line
  line=$(cat "$HOME/.weaver/logs/orphan.jsonl")
  assert_contains "orphan entry has pid" '"pid":' "$line"
  assert_contains "stderr has warning" "orphan" "$stderr_output"

  teardown_session
}

run_session_tests() {
  test_agent_spawn_creates_session
  echo ""
  test_subsequent_events_append_to_session_log
  echo ""
  test_orphan_session_when_no_spawn
}
