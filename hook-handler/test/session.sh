#!/bin/bash
# Session lifecycle tests: spawn, subsequent events, orphan handling.

test_agent_spawn_creates_session() {
  echo "test: agentSpawn creates session index entry and log file"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$HOOK"

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
  assert_contains "log has agentSpawn" '"hook_event_name":"agentSpawn"' "$log_line"

  teardown
}

test_subsequent_events_append_to_session_log() {
  echo "test: subsequent events append to existing session log"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"hello world"}' | bash "$HOOK"

  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  local last_line
  last_line=$(tail -1 "$log_file")
  assert_contains "log has prompt event" '"userPromptSubmit"' "$last_line"
  assert_contains "log has prompt text" '"hello world"' "$last_line"

  teardown
}

test_orphan_session_when_no_spawn() {
  echo "test: events without agentSpawn go to orphan log"
  setup

  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"orphan"}' | bash "$HOOK" 2>&1 1>/dev/null || true)

  assert_file_exists "orphan log created" "$HOME/.weaver/logs/orphan.jsonl"

  local line
  line=$(cat "$HOME/.weaver/logs/orphan.jsonl")
  assert_contains "orphan entry has pid" '"pid":' "$line"
  assert_contains "stderr has warning" "orphan" "$stderr_output"

  teardown
}

run_session_tests() {
  test_agent_spawn_creates_session
  echo ""
  test_subsequent_events_append_to_session_log
  echo ""
  test_orphan_session_when_no_spawn
}
