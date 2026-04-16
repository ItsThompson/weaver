import type {
  WeaverEvent,
  TurnGroup,
  ValidationResult,
} from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";
import { matchToolCalls } from "./tool-calls";
import { isValidationEvent } from "./types";

function extractValidationResults(evts: WeaverEvent[]): ValidationResult[] {
  return evts.reduce<ValidationResult[]>((acc, event) => {
    if (isValidationEvent(event)) {
      acc.push(...event.validationResults);
    }
    return acc;
  }, []);
}

export function groupEventsByTurn(events: WeaverEvent[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  let currentEvents: WeaverEvent[] = [];
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
    const name = event.eventName;

    if (name === WeaverEventName.AGENT_SPAWN) {
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

    if (name === WeaverEventName.USER_PROMPT_SUBMIT) {
      flushTurn(event.timestamp);
      currentPrompt = event.prompt ?? null;
      turnStart = event.timestamp;
      currentEvents.push(event);
      continue;
    }

    if (name === WeaverEventName.STOP) {
      currentEvents.push(event);
      flushTurn(event.timestamp);
      continue;
    }

    currentEvents.push(event);
  }

  if (currentEvents.length > 0) {
    flushTurn(currentEvents[currentEvents.length - 1].timestamp);
  }

  return turns;
}
