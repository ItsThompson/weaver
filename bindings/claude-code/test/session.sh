#!/bin/bash
# Session lifecycle tests for Claude Code: SessionStart, subsequent events, orphan handling.
# Uses a temp copy of the binding with a mock log-event.mjs.

setup_session() {
  setup
  SESSION_TMP=$(mktemp -d)
  cp "$HOOK" "$SESSION_TMP/weaver-log.sh"
  chmod +x "$SESSION_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$SESSION_TMP/lib"
  mkdir -p "$SESSION_TMP/dist"
  write_mock_log_event_parsed "$SESSION_TMP/dist"
  SHOOK="$SESSION_TMP/weaver-log.sh"
}

teardown_session() {
  teardown
  rm -rf "$SESSION_TMP"
}

test_session_start_creates_session() {
  echo "test: SessionStart creates session index entry and log file"
  setup_session

  echo '{"hook_event_name":"SessionStart","session_id":"cc-abc-123","cwd":"/tmp/project"}' | bash "$SHOOK"
  # Give fire-and-forget log-event.mjs time to write
  sleep 0.3

  local sessions_file="$HOME/.weaver/sessions.jsonl"
  assert_file_exists "sessions.jsonl created" "$sessions_file"

  local line
  line=$(cat "$sessions_file")
  assert_contains "has session id" '"id":"cc-abc-123"' "$line"
  assert_contains "has pid" '"pid":' "$line"
  assert_contains "has cwd" '"/tmp/project"' "$line"
  assert_contains "has harness" '"harness":"claude-code"' "$line"
  assert_contains "has customName null" '"customName":null' "$line"

  assert_file_exists "log file created" "$HOME/.weaver/logs/cc-abc-123.jsonl"

  local log_line
  log_line=$(cat "$HOME/.weaver/logs/cc-abc-123.jsonl")
  assert_contains "log has timestamp" '"timestamp":' "$log_line"
  assert_contains "log has SessionStart" '"SessionStart"' "$log_line"

  teardown_session
}

test_subsequent_events_append_to_session_log() {
  echo "test: subsequent events append to existing session log"
  setup_session

  echo '{"hook_event_name":"SessionStart","session_id":"cc-sub-001","cwd":"/tmp"}' | bash "$SHOOK"
  sleep 0.3

  echo '{"hook_event_name":"UserPromptSubmit","session_id":"cc-sub-001","cwd":"/tmp","prompt":"hello world"}' | bash "$SHOOK"
  sleep 0.3

  local log_file="$HOME/.weaver/logs/cc-sub-001.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  local last_line
  last_line=$(tail -1 "$log_file")
  assert_contains "log has prompt event" '"UserPromptSubmit"' "$last_line"
  assert_contains "log has prompt text" '"hello world"' "$last_line"

  teardown_session
}

test_orphan_when_no_session_id() {
  echo "test: events without session_id go to orphan log"
  setup_session

  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"UserPromptSubmit","cwd":"/tmp","prompt":"orphan"}' | bash "$SHOOK" 2>&1 1>/dev/null || true)
  sleep 0.3

  assert_file_exists "orphan log created" "$HOME/.weaver/logs/orphan.jsonl"

  local line
  line=$(cat "$HOME/.weaver/logs/orphan.jsonl")
  assert_contains "orphan entry has pid" '"pid":' "$line"
  assert_contains "stderr has warning" "orphan" "$stderr_output"

  teardown_session
}

test_session_resume_appends_new_entry() {
  echo "test: second SessionStart with same session_id appends (dedup at read time)"
  setup_session

  echo '{"hook_event_name":"SessionStart","session_id":"cc-resume-001","cwd":"/tmp/project1"}' | bash "$SHOOK"
  sleep 0.3

  echo '{"hook_event_name":"SessionStart","session_id":"cc-resume-001","cwd":"/tmp/project1"}' | bash "$SHOOK"
  sleep 0.3

  local sessions_file="$HOME/.weaver/sessions.jsonl"
  local line_count
  line_count=$(wc -l < "$sessions_file" | tr -d ' ')
  assert_eq "sessions.jsonl has 2 lines (dedup at read time)" "2" "$line_count"

  teardown_session
}

run_session_tests() {
  test_session_start_creates_session
  echo ""
  test_subsequent_events_append_to_session_log
  echo ""
  test_orphan_when_no_session_id
  echo ""
  test_session_resume_appends_new_entry
}
