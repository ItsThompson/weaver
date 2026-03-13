import type { HookEvent } from "@weaver/shared/types";
import type { EventContext } from "./types.js";

export function extractContext(
  eventName: string,
  events: HookEvent[],
): EventContext | null {
  if (eventName === "agentSpawn" || eventName === "stop") {
    return null;
  }

  const lastPromptEvent = findLastByName(events, "userPromptSubmit");
  const prompt = lastPromptEvent?.event.prompt ?? null;

  if (eventName === "userPromptSubmit") {
    return { prompt, tool_name: null, tool_input: null, tool_response: null };
  }

  const toolEvent = findLastByName(events, eventName);
  return {
    prompt,
    tool_name: toolEvent?.event.tool_name ?? null,
    tool_input: toolEvent?.event.tool_input ?? null,
    tool_response:
      eventName === "postToolUse" && toolEvent?.event.tool_response
        ? toolEvent.event.tool_response
        : null,
  };
}

function findLastByName(
  events: HookEvent[],
  name: string,
): HookEvent | undefined {
  return events.findLast((e) => e.event.hook_event_name === name);
}
