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
