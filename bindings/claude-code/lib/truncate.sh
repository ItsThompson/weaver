#!/bin/bash
# Truncate tool_response.result values exceeding MAX_RESPONSE_LENGTH.
# Uses a simple approach: if the event contains tool_response, pipe through
# a truncation pass.
truncate_response() {
  local event="$1"
  local max_len="$MAX_RESPONSE_LENGTH"

  if echo "$event" | grep -q '"tool_response"'; then
    echo "$event" | jq -c --argjson max "$max_len" '
      if .tool_response.result then
        .tool_response.result |= map(
          if type == "string" and (length > $max) then .[:$max] + "...[truncated]"
          else . end
        )
      else . end
    '
  else
    echo "$event"
  fi
}
