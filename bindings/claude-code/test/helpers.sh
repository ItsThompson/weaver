#!/bin/bash
# Shared test helpers: assertions, setup/teardown, counters.

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
  if echo "$haystack" | grep -q -- "$needle"; then
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
  if echo "$haystack" | grep -q -- "$needle"; then
    FAIL=$((FAIL + 1))
    echo "  ✗ $label"
    echo "    should not contain: $needle"
  else
    PASS=$((PASS + 1))
    echo "  ✓ $label"
  fi
}

# Write a mock log-event.mjs that parses the event and writes structured JSONL.
# Used by session tests that assert on individual fields (eventName, prompt, etc.).
write_mock_log_event_parsed() {
  local dist_dir="$1"
  cat > "$dist_dir/log-event.mjs" << 'MOCK'
import { appendFileSync } from "node:fs";
const sidIdx = process.argv.indexOf("--session-id");
const sid = sidIdx !== -1 ? process.argv[sidIdx + 1] : "orphan";
const pidIdx = process.argv.indexOf("--pid");
const pid = pidIdx !== -1 ? process.argv[pidIdx + 1] : "0";
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  const raw = Buffer.concat(chunks).toString();
  const event = JSON.parse(raw);
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), sessionId: sid, pid: Number(pid), eventName: event.hook_event_name, cwd: event.cwd, prompt: event.prompt });
  const dir = process.env.HOME + "/.weaver/logs";
  const path = sid === "orphan" ? dir + "/orphan.jsonl" : dir + "/" + sid + ".jsonl";
  appendFileSync(path, entry + "\n");
});
MOCK
}

# Write a mock log-event.mjs that writes the raw event JSON as-is.
# Used by truncation and validation tests that assert on the full event shape.
write_mock_log_event_raw() {
  local dist_dir="$1"
  cat > "$dist_dir/log-event.mjs" << 'MOCK'
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
}
