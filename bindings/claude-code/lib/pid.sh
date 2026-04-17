#!/bin/bash
# Walk up the process tree, skipping shell processes, to find the claude PID.
# In practice $PPID is already the claude PID (verified empirically), but this
# fallback handles cases where an intermediate shell is inserted.
get_caller_pid() {
  local pid="$PPID"
  local max_depth=5
  local depth=0

  while [ "$depth" -lt "$max_depth" ]; do
    local pname
    pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "")

    case "$pname" in
      sh|bash|zsh|dash|fish|-bash|-zsh|-sh)
        local parent
        parent=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')
        if [ -z "$parent" ] || [ "$parent" = "1" ]; then
          break
        fi
        pid="$parent"
        depth=$((depth + 1))
        ;;
      *)
        break
        ;;
    esac
  done

  echo "$pid"
}
