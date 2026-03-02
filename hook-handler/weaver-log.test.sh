#!/bin/bash
set -euo pipefail

# Test runner for weaver-log.sh
# Uses a temp HOME so nothing touches real ~/.weaver/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/weaver-log.sh"
PASS=0
FAIL=0

setup() {
  export HOME=$(mktemp -d)
  mkdir -p "$HOME/.weaver/logs"
}

teardown() {
  rm -rf "$HOME"
}

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label"
    echo "    expected: $expected"
    echo "    actual:   $actual"
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label"
    echo "    expected to contain: $needle"
    echo "    actual: $haystack"
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [ -f "$path" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label — file not found: $path"
  fi
}

# --- Tests ---

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

  # Check log file was created
  local session_id
  session_id=$(echo "$line" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  assert_file_exists "log file created" "$HOME/.weaver/logs/$session_id.jsonl"

  # Check log file has the agentSpawn event
  local log_line
  log_line=$(cat "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "log has timestamp" '"timestamp":' "$log_line"
  assert_contains "log has agentSpawn" '"hook_event_name":"agentSpawn"' "$log_line"

  teardown
}

test_subsequent_events_append_to_session_log() {
  echo "test: subsequent events append to existing session log"
  setup

  # Spawn session first
  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  # Send a userPromptSubmit
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

test_truncation_of_large_responses() {
  echo "test: large tool_response.result values are truncated"
  setup

  # Spawn session
  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  # Send a postToolUse with a response longer than 20 chars
  local long_result
  long_result=$(python3 -c "print('x' * 100)")
  WEAVER_MAX_RESPONSE_LENGTH=20 bash "$HOOK" <<EOF
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{"path":"/a"},"tool_response":{"success":true,"result":["${long_result}"]}}
EOF

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"

  teardown
}

test_short_responses_not_truncated() {
  echo "test: short tool_response.result values are not truncated"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  bash "$HOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["short"]}}
EOF

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response preserved" '"short"' "$last_line"

  # Make sure no truncation marker
  if echo "$last_line" | grep -q 'truncated'; then
    FAIL=$((FAIL + 1))
    echo "  ✗ should not contain truncated marker"
  else
    PASS=$((PASS + 1))
    echo "  ✓ no truncation marker"
  fi

  teardown
}

# --- Run ---

echo ""
echo "=== weaver-log.sh tests ==="
echo ""

test_agent_spawn_creates_session
echo ""
test_subsequent_events_append_to_session_log
echo ""
test_orphan_session_when_no_spawn
echo ""
test_truncation_of_large_responses
echo ""
test_short_responses_not_truncated

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

[ "$FAIL" -eq 0 ] || exit 1
