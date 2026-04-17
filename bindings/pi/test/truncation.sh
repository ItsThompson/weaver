#!/bin/bash
# Truncation tests for pi: large responses, edge cases.

setup_truncation() {
  setup
  TRUNC_TMP=$(mktemp -d)
  cp "$HOOK" "$TRUNC_TMP/weaver-log.sh"
  chmod +x "$TRUNC_TMP/weaver-log.sh"
  cp -r "$(dirname "$HOOK")/lib" "$TRUNC_TMP/lib"
  mkdir -p "$TRUNC_TMP/dist"
  write_mock_log_event_raw "$TRUNC_TMP/dist"
  THOOK="$TRUNC_TMP/weaver-log.sh"
}

teardown_truncation() {
  teardown
  rm -rf "$TRUNC_TMP"
}

start_session_t() {
  echo '{"hook_event_name":"session-start","session_id":"trunc-session","cwd":"/tmp"}' | bash "$THOOK"
  sleep 0.2
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
{"hook_event_name":"post-tool-use","session_id":"trunc-session","cwd":"/tmp","tool_name":"read","tool_input":{"path":"/a"},"tool_response":{"success":true,"result":["${long_result}"]}}
EOF
  sleep 0.2

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
{"hook_event_name":"post-tool-use","session_id":"trunc-session","cwd":"/tmp","tool_name":"read","tool_input":{},"tool_response":{"success":true,"result":["short"]}}
EOF
  sleep 0.2

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
