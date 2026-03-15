import type { HookEvent, ToolCallPair } from "@weaver/shared/types";

export function matchToolCalls(events: HookEvent[]): ToolCallPair[] {
  const pairs: ToolCallPair[] = [];
  const pending = new Map<string, HookEvent[]>();

  for (const event of events) {
    const name = event.event.hook_event_name;
    const toolName = event.event.tool_name;
    if (!toolName) {
      continue;
    }

    if (name === "preToolUse") {
      const queue = pending.get(toolName) ?? [];
      queue.push(event);
      pending.set(toolName, queue);
    } else if (name === "postToolUse") {
      const queue = pending.get(toolName);
      const pre = queue?.shift();
      if (pre) {
        pairs.push({
          toolName,
          input: pre.event.tool_input ?? {},
          response: event.event.tool_response,
          startTime: pre.timestamp,
          endTime: event.timestamp,
        });
      } else {
        // postToolUse without matching preToolUse
        pairs.push({
          toolName,
          input: event.event.tool_input ?? {},
          response: event.event.tool_response,
          startTime: event.timestamp,
          endTime: event.timestamp,
        });
      }
    }
  }

  // Unmatched preToolUse events (no response yet)
  for (const [toolName, queue] of pending) {
    for (const pre of queue) {
      pairs.push({
        toolName,
        input: pre.event.tool_input ?? {},
        startTime: pre.timestamp,
      });
    }
  }

  return pairs;
}
