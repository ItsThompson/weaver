#!/bin/bash
# Truncation tests: large responses, edge cases, boundary conditions.

test_truncation_of_large_responses() {
  echo "test: large tool_response.result values are truncated"
  setup

  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$HOOK"

  local session_id
  session_id=$(cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

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

run_truncation_tests() {
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
}
