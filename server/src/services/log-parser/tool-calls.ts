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
      const pre = pending.get(toolName)?.shift();
      const source = pre ?? event;
      pairs.push({
        toolName,
        input: source.event.tool_input ?? {},
        response: event.event.tool_response,
        startTime: source.timestamp,
        endTime: event.timestamp,
      });
    }
  }

  // Unmatched preToolUse events (no response yet)
  const unmatched = [...pending.values()].flatMap((queue) =>
    queue.map((pre) => ({
      toolName: pre.event.tool_name!,
      input: pre.event.tool_input ?? {},
      startTime: pre.timestamp,
    })),
  );

  return [...pairs, ...unmatched];
}
