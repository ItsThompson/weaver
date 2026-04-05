#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT="$REPO_ROOT/desktop/resources/whisper-server"
TMP_DIR="$REPO_ROOT/.whisper-build"

# Skip if binary already exists
if [ -f "$OUTPUT" ]; then
  echo "whisper-server binary already exists at $OUTPUT — skipping build."
  exit 0
fi

echo "Building whisper-server for arm64 macOS..."

# Clone whisper.cpp if not already present
if [ ! -d "$TMP_DIR" ]; then
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$TMP_DIR"
fi

cd "$TMP_DIR"

# Build whisper-server
cmake -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64
cmake --build build --target whisper-server -j

# Copy binary to desktop/resources
mkdir -p "$(dirname "$OUTPUT")"
cp build/bin/whisper-server "$OUTPUT"

echo "Built whisper-server at $OUTPUT"
file "$OUTPUT"

# Clean up build directory
rm -rf "$TMP_DIR"
echo "Cleaned up build directory."
