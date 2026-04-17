#!/bin/bash
# Truncation tests for Claude Code: large responses, edge cases.
# Uses a temp copy of the binding with a mock log-event.mjs.

setup_truncation() {
  setup
  TRUNC_TMP=$(mktemp -d)
  cp "$HOOK" "$TRUNC_TMP/weaver-log.sh"
  chmod +x "$TRUNC_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$TRUNC_TMP/lib"
  mkdir -p "$TRUNC_TMP/dist"
  # Mock log-event.mjs: write raw event JSON to session log
  cat > "$TRUNC_TMP/dist/log-event.mjs" << 'MOCK'
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
  THOOK="$TRUNC_TMP/weaver-log.sh"
}

teardown_truncation() {
  teardown
  rm -rf "$TRUNC_TMP"
}

# Helper: start a session and return the session ID
start_session_t() {
  echo '{"hook_event_name":"SessionStart","session_id":"trunc-session","cwd":"/tmp"}' | bash "$THOOK"
  sleep 0.3
  echo "trunc-session"
}

test_truncation_of_large_responses() {
  echo "test: large tool_response.result values are truncated"
  setup_truncation

  local session_id
  session_id=$(start_session_t)

  local long_result
  long_result=$(python3 -c "print('x' * 100)")
  WEAVER_MAX_RESPONSE_LENGTH=20 bash "$THOOK" <<EOF
{"hook_event_name":"PostToolUse","session_id":"trunc-session","cwd":"/tmp","tool_name":"Read","tool_input":{"path":"/a"},"tool_response":{"success":true,"result":["${long_result}"]}}
EOF
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "truncated line is valid JSON" "$last_line"

  teardown_truncation
}

test_short_responses_not_truncated() {
  echo "test: short tool_response.result values are not truncated"
  setup_truncation

  local session_id
  session_id=$(start_session_t)

  bash "$THOOK" <<'EOF'
{"hook_event_name":"PostToolUse","session_id":"trunc-session","cwd":"/tmp","tool_name":"Read","tool_input":{},"tool_response":{"success":true,"result":["short"]}}
EOF
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response preserved" '"short"' "$last_line"
  assert_not_contains "no truncation marker" 'truncated' "$last_line"
  assert_valid_json "short response is valid JSON" "$last_line"

  teardown_truncation
}

run_truncation_tests() {
  test_truncation_of_large_responses
  echo ""
  test_short_responses_not_truncated
}
