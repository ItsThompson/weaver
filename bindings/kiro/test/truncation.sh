#!/bin/bash
# Truncation tests: large responses, edge cases, boundary conditions.
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

# Helper: spawn a session and return the session ID
spawn_session_t() {
  echo '{"hook_event_name":"agentSpawn","cwd":"/tmp"}' | bash "$THOOK"
  sleep 0.3
  cat "$HOME/.weaver/sessions.jsonl" | grep -o '"id":"[^"]*"' | cut -d'"' -f4
}

test_truncation_of_large_responses() {
  echo "test: large tool_response.result values are truncated"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  local long_result
  long_result=$(python3 -c "print('x' * 100)")
  WEAVER_MAX_RESPONSE_LENGTH=20 bash "$THOOK" <<EOF
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{"path":"/a"},"tool_response":{"success":true,"result":["${long_result}"]}}
EOF
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "truncated line is valid JSON" "$last_line"

  teardown_truncation
}

test_truncation_with_escaped_quotes() {
  echo "test: truncation handles escaped quotes in result"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  local long_prefix
  long_prefix=$(python3 -c "print('a' * 50)")
  local input
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":["%s and then \\"quoted\\" content after"]}}' "$long_prefix")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=20 bash "$THOOK"
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "escaped-quote truncation is valid JSON" "$last_line"

  teardown_truncation
}

test_truncation_with_backslash_sequences() {
  echo "test: truncation handles backslash sequences (newlines, tabs)"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  WEAVER_MAX_RESPONSE_LENGTH=20 bash "$THOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["line one\nline two\tindented\nline three\\backslash\nline four keeps going and going"]}}
EOF
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_contains "response is truncated" '...\[truncated\]' "$last_line"
  assert_valid_json "backslash-sequence truncation is valid JSON" "$last_line"

  teardown_truncation
}

test_truncation_multiple_result_elements() {
  echo "test: truncation applies to each result element independently"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  local long_a long_b input
  long_a=$(python3 -c "print('a' * 100)")
  long_b=$(python3 -c "print('b' * 100)")
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":["%s","%s"]}}' "$long_a" "$long_b")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=20 bash "$THOOK"
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "multi-element truncation is valid JSON" "$last_line"

  local trunc_count
  trunc_count=$(echo "$last_line" | grep -o '\.\.\.\[truncated\]' | wc -l | tr -d ' ')
  assert_eq "both elements truncated" "2" "$trunc_count"

  teardown_truncation
}

test_truncation_boundary_at_max_length() {
  echo "test: result exactly at max length is not truncated"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  local exact input
  exact=$(python3 -c "print('z' * 50)")
  input=$(printf '{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["%s"]}}' "$exact")
  echo "$input" | WEAVER_MAX_RESPONSE_LENGTH=50 bash "$THOOK"
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "boundary-length line is valid JSON" "$last_line"
  assert_not_contains "not truncated at exact max" 'truncated' "$last_line"

  teardown_truncation
}

test_truncation_preserves_non_string_elements() {
  echo "test: non-string result elements are preserved"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  WEAVER_MAX_RESPONSE_LENGTH=10 bash "$THOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"code","tool_input":{},"tool_response":{"success":true,"result":[42,true,"this string is long enough to truncate"]}}
EOF
  sleep 0.3

  local last_line
  last_line=$(tail -1 "$HOME/.weaver/logs/$session_id.jsonl")
  assert_valid_json "mixed-type result is valid JSON" "$last_line"
  assert_contains "number preserved" '42' "$last_line"
  assert_contains "boolean preserved" 'true' "$last_line"
  assert_contains "string truncated" '...\[truncated\]' "$last_line"

  teardown_truncation
}

test_short_responses_not_truncated() {
  echo "test: short tool_response.result values are not truncated"
  setup_truncation

  local session_id
  session_id=$(spawn_session_t)

  bash "$THOOK" <<'EOF'
{"hook_event_name":"postToolUse","cwd":"/tmp","tool_name":"fs_read","tool_input":{},"tool_response":{"success":true,"result":["short"]}}
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
