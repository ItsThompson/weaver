#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEAVER_BIN="$SCRIPT_DIR/../bin/weaver"
PASS=0
FAIL=0

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

# --- Tests ---

test_get_caller_pid_returns_number() {
  echo "test: get_caller_pid returns a numeric PID"

  # Source the function from the script
  eval "$(sed -n '/^get_caller_pid/,/^}/p' "$WEAVER_BIN")"
  local pid
  pid=$(get_caller_pid)

  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    PASS=$((PASS + 1))
    echo "  ✓ returns numeric PID ($pid)"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ expected numeric PID, got: $pid"
  fi
}

test_get_caller_pid_skips_shells() {
  echo "test: get_caller_pid skips shell processes"

  eval "$(sed -n '/^get_caller_pid/,/^}/p' "$WEAVER_BIN")"
  local pid
  pid=$(get_caller_pid)

  # The returned PID should not be a shell process
  local pname
  pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")

  case "$pname" in
    sh|bash|zsh|dash|fish|-bash|-zsh|-sh)
      FAIL=$((FAIL + 1))
      echo "  ✗ PID $pid is a shell ($pname), should have been skipped"
      ;;
    *)
      PASS=$((PASS + 1))
      echo "  ✓ PID $pid is not a shell ($pname)"
      ;;
  esac
}

test_cli_dir_resolves() {
  echo "test: CLI_DIR resolves to cli/ directory"

  local cli_dir
  cli_dir="$(cd "$(dirname "$WEAVER_BIN")/.." && pwd)/cli"

  if [ -f "$cli_dir/src/index.ts" ]; then
    PASS=$((PASS + 1))
    echo "  ✓ CLI_DIR points to valid cli directory"
  else
    FAIL=$((FAIL + 1))
    echo "  ✗ CLI_DIR does not contain src/index.ts: $cli_dir"
  fi
}

# --- Run ---

echo ""
echo "=== bin/weaver tests ==="
echo ""

test_get_caller_pid_returns_number
echo ""
test_get_caller_pid_skips_shells
echo ""
test_cli_dir_resolves

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

[ "$FAIL" -eq 0 ] || exit 1
