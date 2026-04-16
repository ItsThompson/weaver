import type { WeaverEvent, ToolCallPair } from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";

export function matchToolCalls(events: WeaverEvent[]): ToolCallPair[] {
  const pairs: ToolCallPair[] = [];
  const pending = new Map<string, WeaverEvent[]>();

  for (const event of events) {
    const name = event.eventName;
    const toolName = event.toolName;
    if (!toolName) {
      continue;
    }

    if (name === WeaverEventName.PRE_TOOL_USE) {
      const queue = pending.get(toolName) ?? [];
      queue.push(event);
      pending.set(toolName, queue);
    } else if (name === WeaverEventName.POST_TOOL_USE) {
      const pre = pending.get(toolName)?.shift();
      const source = pre ?? event;
      pairs.push({
        toolName,
        input: source.toolInput ?? {},
        response: event.toolResponse,
        startTime: source.timestamp,
        endTime: event.timestamp,
      });
    }
  }

  // Unmatched preToolUse events (no response yet)
  const unmatched = [...pending.values()].flatMap((queue) =>
    queue.map((pre) => ({
      toolName: pre.toolName!,
      input: pre.toolInput ?? {},
      startTime: pre.timestamp,
    })),
  );

  return [...pairs, ...unmatched];
}
