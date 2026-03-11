#!/bin/bash
# Validation integration tests: validate.mjs and inject.mjs dispatch.

# Create a temp directory with a copy of weaver-log.sh and mock dist/ scripts.
# This lets us control what validate.mjs and inject.mjs do without touching real builds.
setup_validation() {
  setup
  HOOK_TMP=$(mktemp -d)
  cp "$HOOK" "$HOOK_TMP/weaver-log.sh"
  chmod +x "$HOOK_TMP/weaver-log.sh"
  # Copy lib/ so the sourced modules resolve
  cp -r "$(dirname "$HOOK")/lib" "$HOOK_TMP/lib"
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

test_stop_with_failing_validation() {
  echo "test: stop event with failing validation → non-zero exit, STDERR has summary"
  setup_validation

  cat > "$HOOK_TMP/dist/validate.mjs" << 'MOCK'
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

  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines (spawn + stop)" "2" "$line_count"

  teardown_validation
}

test_stop_with_passing_validation() {
  echo "test: stop event with all-passing validation → exit 0"
  setup_validation

  cat > "$HOOK_TMP/dist/validate.mjs" << 'MOCK'
process.exit(0);
MOCK

  spawn_session_v > /dev/null

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  teardown_validation
}

test_stop_without_weaver_config() {
  echo "test: stop event without validate.mjs → exit 0, logging works"
  setup_validation

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

  cat > "$HOOK_TMP/dist/inject.mjs" << 'MOCK'
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

  cat > "$HOOK_TMP/dist/inject.mjs" << 'MOCK'
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

  cat > "$HOOK_TMP/dist/validate.mjs" << 'MOCK'
throw new Error("unexpected crash");
MOCK

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0 (crash swallowed)" "0" "$exit_code"

  local log_file="$HOME/.weaver/logs/$session_id.jsonl"
  local line_count
  line_count=$(wc -l < "$log_file" | tr -d ' ')
  assert_eq "log has 2 lines" "2" "$line_count"

  teardown_validation
}

run_validation_tests() {
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
}
