#!/bin/bash
set -euo pipefail

# Test runner for weaver-log.sh (simplified hook)
# Uses a temp HOME so nothing touches real ~/.weaver/

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/weaver-log.sh"
PASS=0
FAIL=0

setup() {
  export HOME=$(mktemp -d)
  export WEAVER_SERVER="http://localhost:0"
  mkdir -p "$HOME/.weaver"
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

assert_file_not_exists() {
  local label="$1" path="$2"
  if [ ! -f "$path" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label — file should not exist: $path"
  fi
}

assert_dir_not_exists() {
  local label="$1" path="$2"
  if [ ! -d "$path" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label — directory should not exist: $path"
  fi
}

# --- Tests ---

test_agent_spawn_creates_marker_file() {
  echo "test: agentSpawn creates marker file"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$HOOK"

  # Find the marker file
  local marker_files
  marker_files=$(ls "$HOME/.weaver/.current-session-"* 2>/dev/null || true)
  assert_contains "marker file created" ".current-session-" "$marker_files"

  teardown
}

test_agent_spawn_does_not_create_jsonl() {
  echo "test: agentSpawn does not create JSONL files"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$HOOK"

  assert_file_not_exists "no sessions.jsonl" "$HOME/.weaver/sessions.jsonl"
  assert_dir_not_exists "no logs directory" "$HOME/.weaver/logs"

  teardown
}

test_subsequent_events_succeed_after_spawn() {
  echo "test: subsequent events succeed after agentSpawn"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"
  echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"hello"}' | bash "$HOOK"

  # Should succeed (exit 0) and not create any JSONL
  assert_file_not_exists "no sessions.jsonl" "$HOME/.weaver/sessions.jsonl"
  assert_dir_not_exists "no logs directory" "$HOME/.weaver/logs"

  teardown
}

test_subsequent_events_do_not_write_jsonl() {
  echo "test: tool events do not write JSONL"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  bash "$HOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["some content"]}}
EOF

  assert_dir_not_exists "no logs directory" "$HOME/.weaver/logs"

  teardown
}

test_orphan_event_without_spawn() {
  echo "test: events without agentSpawn fail with orphan warning"
  setup

  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp","prompt":"orphan"}' | bash "$HOOK" 2>&1 1>/dev/null || true)

  assert_contains "stderr has warning" "no session found" "$stderr_output"
  # No orphan.jsonl should be created
  assert_dir_not_exists "no logs directory" "$HOME/.weaver/logs"

  teardown
}

test_orphan_event_exits_nonzero() {
  echo "test: orphan event exits with code 1"
  setup

  local exit_code=0
  echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp"}' | bash "$HOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 1" "1" "$exit_code"

  teardown
}

test_marker_file_contains_pid() {
  echo "test: marker file contains caller PID"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local marker_file
  marker_file=$(ls "$HOME/.weaver/.current-session-"* 2>/dev/null | head -1)
  local content
  content=$(cat "$marker_file")

  # Content should be a number (the PID)
  if echo "$content" | grep -qE '^[0-9]+$'; then
    PASS=$((PASS + 1))
    echo "  ✓ marker file contains numeric PID"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ marker file contains numeric PID — got: $content"
  fi

  teardown
}

test_weaver_dir_created_if_missing() {
  echo "test: ~/.weaver directory created if missing"
  setup
  rm -rf "$HOME/.weaver"

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  if [ -d "$HOME/.weaver" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ .weaver directory created"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ .weaver directory not created"
  fi

  teardown
}

# --- Run ---

echo ""
echo "=== weaver-log.sh tests ==="
echo ""

test_agent_spawn_creates_marker_file
echo ""
test_agent_spawn_does_not_create_jsonl
echo ""
test_subsequent_events_succeed_after_spawn
echo ""
test_subsequent_events_do_not_write_jsonl
echo ""
test_orphan_event_without_spawn
echo ""
test_orphan_event_exits_nonzero
echo ""
test_marker_file_contains_pid
echo ""
test_weaver_dir_created_if_missing

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

[ "$FAIL" -eq 0 ] || exit 1
