#!/bin/bash
# Validation integration tests for Claude Code.
# Creates a temp directory mimicking the monorepo layout so ROOT_DIR resolves correctly.

setup_validation() {
  setup
  # Create a temp monorepo structure: root/bindings/claude-code/
  MONO_TMP=$(mktemp -d)
  BINDING_TMP="$MONO_TMP/bindings/claude-code"
  mkdir -p "$BINDING_TMP"
  cp "$HOOK" "$BINDING_TMP/weaver-log.sh"
  chmod +x "$BINDING_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$BINDING_TMP/lib"
  # Mock log-event.mjs in binding dist
  mkdir -p "$BINDING_TMP/dist"
  write_mock_log_event_raw "$BINDING_TMP/dist"
  # Validation dist at ROOT_DIR/validation/dist/
  mkdir -p "$MONO_TMP/validation/dist"
  VHOOK="$BINDING_TMP/weaver-log.sh"
}

teardown_validation() {
  teardown
  rm -rf "$MONO_TMP"
}

# Start a session using the validation hook copy and return the session ID
start_session_v() {
  echo '{"hook_event_name":"SessionStart","session_id":"val-session","cwd":"/tmp/project"}' | bash "$VHOOK"
  sleep 1
  echo "val-session"
}

test_stop_with_failing_validation() {
  echo "test: Stop event with failing validation -> non-zero exit, STDERR has summary"
  setup_validation

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
process.stderr.write("⚠ weaver: 1/1 validations failed (test)\n");
process.exit(1);
MOCK

  start_session_v > /dev/null

  local exit_code=0
  local stderr_output
  stderr_output=$(echo '{"hook_event_name":"Stop","session_id":"val-session","cwd":"/tmp/project"}' | bash "$VHOOK" 2>&1 1>/dev/null) || exit_code=$?

  assert_eq "exit code is non-zero" "1" "$exit_code"
  assert_contains "stderr has failure summary" "⚠ weaver:" "$stderr_output"

  teardown_validation
}

test_stop_with_passing_validation() {
  echo "test: Stop event with all-passing validation -> exit 0"
  setup_validation

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
process.exit(0);
MOCK

  start_session_v > /dev/null

  local exit_code=0
  echo '{"hook_event_name":"Stop","session_id":"val-session","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  teardown_validation
}

test_stop_without_validate_script() {
  echo "test: Stop event without validate.mjs -> exit 0, logging works"
  setup_validation

  start_session_v > /dev/null

  local exit_code=0
  echo '{"hook_event_name":"Stop","session_id":"val-session","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  teardown_validation
}

test_post_tool_use_with_harness_flag() {
  echo "test: PostToolUse dispatches validation with --harness claude-code"
  setup_validation

  # Mock validate.mjs that writes its args to a file so we can inspect
  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
import { writeFileSync } from "node:fs";
writeFileSync(process.env.HOME + "/.weaver/validate-args.txt", process.argv.join(" "));
process.exit(0);
MOCK

  start_session_v > /dev/null

  echo '{"hook_event_name":"PostToolUse","session_id":"val-session","cwd":"/tmp/project","tool_name":"Write"}' | bash "$VHOOK" 2>/dev/null

  local args_file="$HOME/.weaver/validate-args.txt"
  assert_file_exists "validate args captured" "$args_file"

  local args
  args=$(cat "$args_file")
  assert_contains "has --harness claude-code" "--harness claude-code" "$args"
  assert_contains "has --trigger PostToolUse" "--trigger PostToolUse" "$args"
  assert_contains "has --tool-name Write" "--tool-name Write" "$args"

  teardown_validation
}

test_validation_runner_crash() {
  echo "test: validation runner crash -> logging succeeds, exit 0 fallback"
  setup_validation

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
throw new Error("unexpected crash");
MOCK

  start_session_v > /dev/null

  local exit_code=0
  echo '{"hook_event_name":"Stop","session_id":"val-session","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0 (crash swallowed)" "0" "$exit_code"

  teardown_validation
}

run_validation_tests() {
  test_stop_with_failing_validation
  echo ""
  test_stop_with_passing_validation
  echo ""
  test_stop_without_validate_script
  echo ""
  test_post_tool_use_with_harness_flag
  echo ""
  test_validation_runner_crash
}
