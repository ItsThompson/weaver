#!/bin/bash
# weaver-view (wv): Opens the Weaver dashboard for the current kiro-cli session.
# Finds the kiro-cli PID by walking up the process tree, then tells the
# Weaver server to navigate the dashboard to that session's detail page.
set -euo pipefail

WEAVER_SERVER="${WEAVER_SERVER:-http://localhost:8143}"

# Walk up from current shell to find the kiro-cli PID
pid="$$"
max_depth=10
depth=0

while [ "$depth" -lt "$max_depth" ]; do
  parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  [ -z "$parent" ] || [ "$parent" = "1" ] && break
  pid="$parent"

  pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")
  case "$pname" in
    sh|bash|zsh|dash|fish|-bash|-zsh|-sh)
      depth=$((depth + 1))
      ;;
    *)
      break
      ;;
  esac
done

result=$(curl -s --max-time 3 -w "\n%{http_code}" -X POST "$WEAVER_SERVER/api/view" \
  -H "Content-Type: application/json" \
  -d "{\"pid\":$pid}" 2>/dev/null) || { echo "Weaver server not running"; exit 1; }

http_code=$(echo "$result" | tail -1)

if [ "$http_code" = "200" ]; then
  echo "Opening session in Weaver dashboard"
elif [ "$http_code" = "404" ]; then
  echo "No Weaver session found for PID $pid"
else
  echo "Weaver server error ($http_code)"
fi
