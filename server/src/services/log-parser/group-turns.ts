import type {
  HookEvent,
  TurnGroup,
  ValidationResult,
} from "@weaver/shared/types";
import { matchToolCalls } from "./tool-calls";

function extractValidationResults(evts: HookEvent[]): ValidationResult[] {
  return evts
    .filter(
      (e): e is HookEvent & { event: { results: ValidationResult[] } } =>
        e.event.hook_event_name === "validation" &&
        Array.isArray((e.event as any).results),
    )
    .flatMap((e) => e.event.results);
}

export function groupEventsByTurn(events: HookEvent[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  let currentEvents: HookEvent[] = [];
  let currentPrompt: string | null = null;
  let turnStart: string | null = null;

  const flushTurn = (endTime: string) => {
    if (currentEvents.length === 0) {
      return;
    }
    turns.push({
      id: turns.length,
      userPrompt: currentPrompt,
      events: currentEvents,
      toolCalls: matchToolCalls(currentEvents),
      startTime: turnStart ?? currentEvents[0].timestamp,
      endTime,
      validationResults: extractValidationResults(currentEvents),
    });
    currentEvents = [];
    currentPrompt = null;
    turnStart = null;
  };

  for (const event of events) {
    const name = event.event.hook_event_name;

    if (name === "agentSpawn") {
      // agentSpawn is its own "turn" (session start marker)
      flushTurn(event.timestamp);
      turns.push({
        id: turns.length,
        userPrompt: null,
        events: [event],
        toolCalls: [],
        startTime: event.timestamp,
        endTime: event.timestamp,
        validationResults: [],
      });
      continue;
    }

    if (name === "userPromptSubmit") {
      // New user turn — flush any prior incomplete turn
      flushTurn(event.timestamp);
      currentPrompt = event.event.prompt ?? null;
      turnStart = event.timestamp;
      currentEvents.push(event);
      continue;
    }

    if (name === "stop") {
      currentEvents.push(event);
      flushTurn(event.timestamp);
      continue;
    }

    currentEvents.push(event);
  }

  // Flush any remaining events without a stop marker
  if (currentEvents.length > 0) {
    flushTurn(currentEvents[currentEvents.length - 1].timestamp);
  }

  return turns;
}
