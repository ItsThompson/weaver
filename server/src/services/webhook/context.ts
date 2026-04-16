import type { WeaverEvent } from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";
import type { EventContext } from "./types";

export function extractContext(
  eventName: WeaverEventName,
  events: WeaverEvent[],
): EventContext | null {
  if (
    eventName === WeaverEventName.AGENT_SPAWN ||
    eventName === WeaverEventName.STOP
  ) {
    return null;
  }

  const lastPromptEvent = findLastByName(
    events,
    WeaverEventName.USER_PROMPT_SUBMIT,
  );
  const prompt = lastPromptEvent?.prompt ?? null;

  if (eventName === WeaverEventName.USER_PROMPT_SUBMIT) {
    return { prompt, tool_name: null, tool_input: null, tool_response: null };
  }

  const toolEvent = findLastByName(events, eventName);
  return {
    prompt,
    tool_name: toolEvent?.toolName ?? null,
    tool_input: toolEvent?.toolInput ?? null,
    tool_response:
      eventName === WeaverEventName.POST_TOOL_USE && toolEvent?.toolResponse
        ? toolEvent.toolResponse
        : null,
  };
}

function findLastByName(
  events: WeaverEvent[],
  name: WeaverEventName,
): WeaverEvent | undefined {
  return events.findLast((e) => e.eventName === name);
}
