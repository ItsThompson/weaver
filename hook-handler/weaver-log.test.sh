#!/bin/bash
set -euo pipefail

# Test orchestrator for weaver-log.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/weaver-log.sh"

source "$SCRIPT_DIR/test/helpers.sh"
source "$SCRIPT_DIR/test/session.sh"
source "$SCRIPT_DIR/test/truncation.sh"
source "$SCRIPT_DIR/test/validation.sh"

echo ""
echo "=== weaver-log.sh tests ==="

echo ""
echo "--- session ---"
echo ""
run_session_tests

echo ""
echo "--- truncation ---"
echo ""
run_truncation_tests

echo ""
echo "--- validation ---"
echo ""
run_validation_tests

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

[ "$FAIL" -eq 0 ] || exit 1
