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
  export WEAVER_SERVER="http://localhost:0"
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

assert_valid_json() {
  local label="$1" text="$2"
  if echo "$text" | python3 -c "import sys,json; json.loads(sys.stdin.read())" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ $label — invalid JSON"
    echo "    got: $text"
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -q "$needle"; then
    FAIL=$((FAIL + 1))
    echo "  ✗ $label"
    echo "    should not contain: $needle"
  else
    PASS=$((PASS + 1))
    echo "  ✓ $label"
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
  assert_valid_json "truncated line is valid JSON" "$last_line"

  teardown
}

test_truncation_with_escaped_quotes() {
  echo "test: truncation handles escaped quotes in result"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  # Result contains escaped quotes — the original bug trigger
  local long_prefix
  long_prefix=$(python3 -c "print('a' * 50)")
  local input
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":["%s and then \\"quoted\\" content after"]}}' "$long_prefix")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=20 bash "$HOOK"

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "escaped-quote truncation is valid JSON" "$last_line"

  teardown
}

test_truncation_with_backslash_sequences() {
  echo "test: truncation handles backslash sequences (newlines, tabs)"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  WEAVER_MAX_RESPONSE_LENGTH=20 bash "$HOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["line one\nline two\tindented\nline three\\backslash\nline four keeps going and going"]}}
EOF

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "backslash-sequence truncation is valid JSON" "$last_line"

  teardown
}

test_truncation_multiple_result_elements() {
  echo "test: truncation applies to each result element independently"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  local long_a long_b input
  long_a=$(python3 -c "print('a' * 100)")
  long_b=$(python3 -c "print('b' * 100)")
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":["%s","%s"]}}' "$long_a" "$long_b")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=20 bash "$HOOK"

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "multi-element truncation is valid JSON" "$last_line"

  # Both elements should be truncated — count occurrences
  local trunc_count
  trunc_count=$(echo "$last_line" | grep -o '\.\.\.\[truncated\]' | wc -l | tr -d ' ')
  assert_eq "both elements truncated" "2" "$trunc_count"

  teardown
}

test_truncation_boundary_at_max_length() {
  echo "test: result exactly at max length is not truncated"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  # Exactly 50 chars — should NOT be truncated
  local exact input
  exact=$(python3 -c "print('z' * 50)")
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["%s"]}}' "$exact")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=50 bash "$HOOK"

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "boundary-length line is valid JSON" "$last_line"
  assert_not_contains "not truncated at exact max" 'truncated' "$last_line"

  teardown
}

test_truncation_preserves_non_string_elements() {
  echo "test: non-string result elements are preserved"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

  WEAVER_MAX_RESPONSE_LENGTH=10 bash "$HOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":[42,true,"this string is long enough to truncate"]}}
EOF

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "mixed-type result is valid JSON" "$last_line"
  assert_contains "number preserved" '42' "$last_line"
  assert_contains "boolean preserved" 'true' "$last_line"
  assert_contains "string truncated" '...\[truncated\]' "$last_line"

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
  assert_not_contains "no truncation marker" 'truncated' "$last_line"
  assert_valid_json "short response is valid JSON" "$last_line"

  teardown
}

# --- Validation integration helpers ---

# Create a temp directory with a copy of weaver-log.sh and mock dist/ scripts.
# This lets us control what validate.js and inject.js do without touching real builds.
setup_validation() {
  setup
  HOOK_TMP=$(mktemp -d)
  cp "$HOOK" "$HOOK_TMP/weaver-log.sh"
  chmod +x "$HOOK_TMP/weaver-log.sh"
  mkdir -p "$HOOK_TMP/dist"
  VHOOK="$HOOK_TMP/weaver-log.sh"
}

teardown_validation() {
  teardown
  rm -rf "$HOOK_TMP"
}

# Spawn a session using the validation hook copy and return the session ID
spawn_session_v() {
  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$VHOOK"
  cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4
}

# --- Validation integration tests ---

test_stop_with_failing_validation() {
  echo "test: stop event with failing validation → non-zero exit, STDERR has summary"
  setup_validation

  # Mock validate.js that reports a failure
  cat > "$HOOK_TMP/dist/validate.js" << 'MOCK'
process.stderr.write("⚠ weaver: 1/1 validations failed (test)\n");
process.exit(1);
MOCK

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>&1 1>/dev/null) || exit_code=$?

  assert_eq "exit code is non-zero" "1" "$exit_code"
  assert_contains "stderr has failure summary" "⚠ weaver:" "$stderr_output"
  assert_contains "stderr has hook name" "test" "$stderr_output"

  # Logging still happened
  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines (spawn + stop)" "2" "$line_count"

  teardown_validation
}

test_stop_with_passing_validation() {
  echo "test: stop event with all-passing validation → exit 0"
  setup_validation

  cat > "$HOOK_TMP/dist/validate.js" << 'MOCK'
process.exit(0);
MOCK

  spawn_session_v > /dev/null

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  teardown_validation
}

test_stop_without_weaver_config() {
  echo "test: stop event without validate.js → exit 0, logging works"
  setup_validation

  # No dist/validate.js — remove the mock dir
  rm -rf "$HOOK_TMP/dist"

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  teardown_validation
}

test_user_prompt_with_pending_file() {
  echo "test: userPromptSubmit with pending file → STDOUT has formatted failures"
  setup_validation

  # Mock inject.js that outputs validation results
  cat > "$HOOK_TMP/dist/inject.js" << 'MOCK'
process.stdout.write("[Weaver Validation — Previous Turn]\n\n✗ test (1.0s)\n  some error\n");
process.exit(0);
MOCK

  spawn_session_v > /dev/null

  local stdout_output
  stdout_output=$(echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp/project","prompt":"fix it"}' | bash "$VHOOK" 2>/dev/null)

  assert_contains "stdout has validation header" "Weaver Validation" "$stdout_output"
  assert_contains "stdout has failure marker" "✗ test" "$stdout_output"

  teardown_validation
}

test_user_prompt_without_pending_file() {
  echo "test: userPromptSubmit without pending file → no STDOUT"
  setup_validation

  # Mock inject.js that outputs nothing (no pending file)
  cat > "$HOOK_TMP/dist/inject.js" << 'MOCK'
process.exit(0);
MOCK

  spawn_session_v > /dev/null

  local stdout_output
  stdout_output=$(echo '{"hook_event_name":"userPromptSubmit","cwd":"/tmp/project","prompt":"hello"}' | bash "$VHOOK" 2>/dev/null)

  assert_eq "stdout is empty" "" "$stdout_output"

  teardown_validation
}

test_validation_runner_crash() {
  echo "test: validation runner crash → logging succeeds, exit 0 fallback"
  setup_validation

  # Mock validate.js that crashes (no weaver marker in stderr)
  cat > "$HOOK_TMP/dist/validate.js" << 'MOCK'
throw new Error("unexpected crash");
MOCK

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0 (crash swallowed)" "0" "$exit_code"

  # Logging still happened
  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  teardown_validation
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
test_truncation_with_escaped_quotes
echo ""
test_truncation_with_backslash_sequences
echo ""
test_truncation_multiple_result_elements
echo ""
test_truncation_boundary_at_max_length
echo ""
test_truncation_preserves_non_string_elements
echo ""
test_short_responses_not_truncated
echo ""
test_stop_with_failing_validation
echo ""
test_stop_with_passing_validation
echo ""
test_stop_without_weaver_config
echo ""
test_user_prompt_with_pending_file
echo ""
test_user_prompt_without_pending_file
echo ""
test_validation_runner_crash

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

[ "$FAIL" -eq 0 ] || exit 1
