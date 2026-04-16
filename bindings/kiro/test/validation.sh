#!/bin/bash
# Validation integration tests: validate.mjs and inject.mjs dispatch.
# Creates a temp directory mimicking the monorepo layout so ROOT_DIR resolves correctly.

setup_validation() {
  setup
  # Create a temp monorepo structure: root/bindings/kiro/
  MONO_TMP=$(mktemp -d)
  BINDING_TMP="$MONO_TMP/bindings/kiro"
  mkdir -p "$BINDING_TMP"
  cp "$HOOK" "$BINDING_TMP/weaver-log.sh"
  chmod +x "$BINDING_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$BINDING_TMP/lib"
  # Mock log-event.mjs in binding dist
  mkdir -p "$BINDING_TMP/dist"
  cat > "$BINDING_TMP/dist/log-event.mjs" << 'MOCK'
import { appendFileSync } from "node:fs";
const sidIdx = process.argv.indexOf("--session-id");
const sid = sidIdx !== -1 ? process.argv[sidIdx + 1] : "orphan";
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const raw = Buffer.concat(chunks).toString().trim();
  const dir = process.env.HOME + "/.weaver/logs";
  const path = sid === "orphan" ? dir + "/orphan.jsonl" : dir + "/" + sid + ".jsonl";
  appendFileSync(path, JSON.stringify({ timestamp: new Date().toISOString(), event: JSON.parse(raw) }) + "\n");
});
MOCK
  # Validation dist at ROOT_DIR/validation/dist/
  mkdir -p "$MONO_TMP/validation/dist"
  VHOOK="$BINDING_TMP/weaver-log.sh"
}

teardown_validation() {
  teardown
  rm -rf "$MONO_TMP"
}

# Spawn a session using the validation hook copy and return the session ID
spawn_session_v() {
  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp/project"}' | bash "$VHOOK"
  sleep 0.3
  cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4
}

test_stop_with_failing_validation() {
  echo "test: stop event with failing validation → non-zero exit, STDERR has summary"
  setup_validation

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
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

  teardown_validation
}

test_stop_with_passing_validation() {
  echo "test: stop event with all-passing validation → exit 0"
  setup_validation

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
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

  # No validate.mjs in validation/dist/

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0" "0" "$exit_code"

  teardown_validation
}

test_user_prompt_with_pending_file() {
  echo "test: userPromptSubmit with pending file → STDOUT has formatted failures"
  setup_validation

  cat > "$MONO_TMP/validation/dist/inject.mjs" << 'MOCK'
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

  cat > "$MONO_TMP/validation/dist/inject.mjs" << 'MOCK'
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

  cat > "$MONO_TMP/validation/dist/validate.mjs" << 'MOCK'
throw new Error("unexpected crash");
MOCK

  local session_id
  session_id=$(spawn_session_v)

  local exit_code=0
  echo '{"hook_event_name":"stop","cwd":"/tmp/project"}' | bash "$VHOOK" 2>/dev/null || exit_code=$?

  assert_eq "exit code is 0 (crash swallowed)" "0" "$exit_code"

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
