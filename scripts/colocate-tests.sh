#!/bin/bash
set -euo pipefail

# Moves test files from __tests__/ directories to sit next to their implementation files.
#
# How destination is determined:
#   For each test file, we look at its relative path under __tests__/ and map it to the
#   corresponding path under src/. When a test imports from a deeper module path (e.g.
#   components/utils.test.tsx imports from components/ToolCallCard/utils), we use an
#   explicit override map to place it correctly.
#
# Edge cases handled:
#   - Tests that don't map 1:1 to a source path (override map)
#   - Verifies destination directory exists before moving
#   - Updates relative import paths (../../src/... → ./)
#   - Preserves shared test infra (mocks/, setup.ts) in __tests__/
#   - Removes empty __tests__ subdirectories after moves
#   - Updates jest config testMatch patterns

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN="${1:-}"

log() { echo "  $1"; }
run() {
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# ── Explicit move map ──
# Format: "source_test_path|destination_test_path"
# Paths are relative to project root.
MOVES=(
  # Server
  "server/__tests__/routes/sessions.test.ts|server/src/routes/sessions.test.ts"
  "server/__tests__/services/log-parser.test.ts|server/src/services/log-parser.test.ts"
  "server/__tests__/services/storage.test.ts|server/src/services/storage.test.ts"
  # Client - ToolCallCard
  "client/__tests__/components/ToolCallCard.test.tsx|client/src/components/ToolCallCard/ToolCallCard.test.tsx"
  "client/__tests__/components/JsonBlock.test.tsx|client/src/components/ToolCallCard/JsonBlock.test.tsx"
  "client/__tests__/components/utils.test.tsx|client/src/components/ToolCallCard/utils.test.tsx"
  # Client - SessionsContext
  "client/__tests__/context/reducer.test.ts|client/src/context/SessionsContext/reducer.test.ts"
  "client/__tests__/context/SessionsContext.test.tsx|client/src/context/SessionsContext/SessionsContext.test.tsx"
  # Client - Pages
  "client/__tests__/pages/SessionsPage.test.tsx|client/src/pages/SessionsPage/SessionsPage.test.tsx"
  "client/__tests__/pages/SessionTable.test.tsx|client/src/pages/SessionsPage/components/SessionTable.test.tsx"
  "client/__tests__/pages/SessionDetailPage.test.tsx|client/src/pages/SessionDetailPage/SessionDetailPage.test.tsx"
  "client/__tests__/pages/SessionDetailPage/utils.test.ts|client/src/pages/SessionDetailPage/utils.test.ts"
)

echo "=== Moving test files ==="
for entry in "${MOVES[@]}"; do
  src="${ROOT}/${entry%%|*}"
  dst="${ROOT}/${entry##*|}"

  if [ ! -f "$src" ]; then
    log "SKIP (not found): $src"
    continue
  fi

  dst_dir=$(dirname "$dst")
  if [ ! -d "$dst_dir" ]; then
    log "WARN: destination dir missing, creating: $dst_dir"
    run mkdir -p "$dst_dir"
  fi

  log "MOVE: ${entry%%|*} → ${entry##*|}"
  run mv "$src" "$dst"
done

echo ""
echo "=== Updating import paths ==="

# For each moved file, rewrite relative imports that pointed back through __tests__ to src/
# e.g. ../../src/components/ToolCallCard → ./  or ../  depending on new location
for entry in "${MOVES[@]}"; do
  dst="${ROOT}/${entry##*|}"
  [ -f "$dst" ] || continue

  pkg=$(echo "${entry##*|}" | cut -d/ -f1)  # "server" or "client"

  # Server tests: mock paths like '../../src/services/storage.js' become './storage.js'
  # Client tests: paths like '../../src/components/ToolCallCard' become './' or '../'
  # Strategy: compute the old relative prefix and the new one, then sed replace.

  log "UPDATE: ${entry##*|}"

  if [ "$pkg" = "server" ]; then
    # Server tests used paths like ../../src/services/foo.js or ../../src/utils/logger.js
    # Now they're in src/services/ or src/routes/, so ../../src/ becomes ../
    run sed -i '' \
      -e "s|'../\.\./src/|'../|g" \
      -e "s|\"../\.\./src/|\"../|g" \
      "$dst"
  else
    # Client tests used paths like ../../src/foo or ../../../src/foo
    # Now colocated, so ../../src/context/SessionsContext/reducer → ./reducer
    # This varies per file, so we use a general approach:
    # Replace any '../'* + 'src/' prefix with the correct relative path.

    # Compute how deep the dest is under src/
    # e.g. client/src/components/ToolCallCard/utils.test.tsx → depth 2 under src
    src_rel="${entry##*|}"           # client/src/components/ToolCallCard/utils.test.tsx
    src_rel="${src_rel#*/src/}"      # components/ToolCallCard/utils.test.tsx
    depth=$(echo "$src_rel" | tr '/' '\n' | wc -l)
    depth=$((depth - 1))  # subtract the filename itself

    # Build the old prefix pattern: (../)* + src/
    # and the new prefix: just ./  (for same dir) or ../ chains
    # Since tests now live IN src/, imports to sibling modules use standard relative paths.

    # Simple approach: replace all occurrences of paths going up to src/ with correct relative
    # For most files, ../../src/ or ../../../src/ should become ./ or ../ etc.
    run sed -i '' \
      -e "s|'\.\./\.\./\.\./src/|'../../../|g" \
      -e "s|'\.\./\.\./src/|'../../|g" \
      -e "s|\"../\.\./\.\./src/|\"../../../|g" \
      -e "s|\"../\.\./src/|\"../../|g" \
      "$dst"

    # Now fix: tests that are colocated need shorter paths
    # e.g. client/src/components/ToolCallCard/utils.test.tsx importing ../../components/ToolCallCard/utils → ./utils
    # This requires per-file fixup. Let's handle the known patterns:

    case "${entry##*|}" in
      # ToolCallCard tests - now inside components/ToolCallCard/
      *components/ToolCallCard/ToolCallCard.test.tsx)
        run sed -i '' "s|'../../components/ToolCallCard'|'.'|g" "$dst"
        ;;
      *components/ToolCallCard/JsonBlock.test.tsx)
        run sed -i '' "s|'../../components/ToolCallCard/JsonBlock'|'./JsonBlock'|g" "$dst"
        ;;
      *components/ToolCallCard/utils.test.tsx)
        run sed -i '' "s|'../../components/ToolCallCard/utils'|'./utils'|g" "$dst"
        ;;
      # SessionsContext tests - now inside context/SessionsContext/
      *context/SessionsContext/reducer.test.ts)
        run sed -i '' "s|'../../context/SessionsContext/reducer'|'./reducer'|g" "$dst"
        ;;
      *context/SessionsContext/SessionsContext.test.tsx)
        run sed -i '' "s|'../../context/SessionsContext'|'.'|g" "$dst"
        run sed -i '' "s|'../../utils/api'|'../../utils/api'|g" "$dst"
        ;;
      # SessionsPage tests - now inside pages/SessionsPage/
      *pages/SessionsPage/SessionsPage.test.tsx)
        run sed -i '' "s|'../../pages/SessionsPage'|'.'|g" "$dst"
        run sed -i '' "s|'../../context/SessionsContext'|'../../context/SessionsContext'|g" "$dst"
        run sed -i '' "s|'../../utils/api'|'../../utils/api'|g" "$dst"
        ;;
      *pages/SessionsPage/components/SessionTable.test.tsx)
        run sed -i '' "s|'../../pages/SessionsPage/components/SessionTable'|'./SessionTable'|g" "$dst"
        run sed -i '' "s|'../../utils/api'|'../../../utils/api'|g" "$dst"
        run sed -i '' "s|'../../context/SessionsContext'|'../../../context/SessionsContext'|g" "$dst"
        ;;
      # SessionDetailPage tests
      *pages/SessionDetailPage/SessionDetailPage.test.tsx)
        run sed -i '' "s|'../../pages/SessionDetailPage'|'.'|g" "$dst"
        run sed -i '' "s|'../../utils/api'|'../../utils/api'|g" "$dst"
        ;;
      *pages/SessionDetailPage/utils.test.ts)
        run sed -i '' "s|'../../../pages/SessionDetailPage/utils'|'./utils'|g" "$dst"
        ;;
    esac
  fi
done

echo ""
echo "=== Updating jest configs ==="

# Server: change testMatch from __tests__ to src/**/*.test.ts
SCONF="$ROOT/server/jest.config.mjs"
if [ -f "$SCONF" ]; then
  log "UPDATE: server/jest.config.mjs"
  run sed -i '' "s|'<rootDir>/__tests__/\*\*/\*.test.ts'|'<rootDir>/src/**/*.test.ts'|g" "$SCONF"
fi

# Client: change testMatch from __tests__ to src/**/*.test.ts(x)
CCONF="$ROOT/client/jest.config.mjs"
if [ -f "$CCONF" ]; then
  log "UPDATE: client/jest.config.mjs"
  run sed -i '' \
    -e "s|'<rootDir>/__tests__/\*\*/\*.test.ts'|'<rootDir>/src/**/*.test.ts'|g" \
    -e "s|'<rootDir>/__tests__/\*\*/\*.test.tsx'|'<rootDir>/src/**/*.test.tsx'|g" \
    "$CCONF"
  # Update mock paths: __tests__/mocks/ stays, but setupFiles path stays too
  # These reference __tests__/ which still exists for mocks/setup — no change needed
fi

echo ""
echo "=== Cleaning empty directories ==="

# Remove empty subdirs under __tests__ (but keep __tests__ itself if mocks/setup remain)
find "$ROOT/server/__tests__" -type d -empty -delete 2>/dev/null || true
find "$ROOT/client/__tests__" -mindepth 1 -type d -empty -delete 2>/dev/null || true

# Server __tests__ should be fully empty now
if [ -d "$ROOT/server/__tests__" ] && [ -z "$(ls -A "$ROOT/server/__tests__")" ]; then
  log "REMOVE: server/__tests__/ (empty)"
  run rmdir "$ROOT/server/__tests__"
fi

echo ""
echo "=== Done ==="
echo "Run 'npm test' from project root to verify."
