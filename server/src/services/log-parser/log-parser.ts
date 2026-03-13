import { join } from "node:path";
import { homedir } from "node:os";
import { PENDING_APPROVAL_THRESHOLD_MS } from "@weaver/shared/types";
import type {
  HookEvent,
  TurnGroup,
  ToolCallPair,
  ActivityStatus,
  ValidationResult,
} from "@weaver/shared/types";
import { log } from "../../utils/logger";
import { FileCache, parseJsonlFile } from "../file-cache/index";

const LOGS_DIR = () => join(homedir(), ".weaver", "logs");

const logCache = new FileCache<HookEvent[]>();
export const _logCache = logCache;

export function deriveActivity(
  eventName: string,
  eventTimestamp?: string,
): ActivityStatus {
  switch (eventName) {
    case "agentSpawn":
      return "starting";
    case "stop":
      return "idle";
    case "preToolUse": {
      if (eventTimestamp) {
        const age = Date.now() - new Date(eventTimestamp).getTime();
        if (age > PENDING_APPROVAL_THRESHOLD_MS) {
          return "pending_approval";
        }
      }
      return "running_tool";
    }
    default:
      return "processing";
  }
}

export async function getLastEvent(
  sessionId: string,
): Promise<{ name: string; timestamp: string } | null> {
  const events = await parseLogFile(sessionId);
  const last = events.findLast((e) => e.event.hook_event_name);
  return last
    ? { name: last.event.hook_event_name!, timestamp: last.timestamp }
    : null;
}

export async function parseLogFile(sessionId: string): Promise<HookEvent[]> {
  const filePath = join(LOGS_DIR(), `${sessionId}.jsonl`);
  return logCache.get(filePath, () =>
    parseJsonlFile<HookEvent>(filePath, (line) =>
      log({
        timestamp: new Date().toISOString(),
        event: "malformed_log_line",
        sessionId,
        line,
      }),
    ),
  );
}

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

function matchToolCalls(events: HookEvent[]): ToolCallPair[] {
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
