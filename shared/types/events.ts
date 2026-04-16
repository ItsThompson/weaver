import type { ValidationResult } from "./validation";
import type { WeaverEvent } from "./weaver-event";
import { WeaverEventName } from "./weaver-event";

export const HOOK_EVENT_NAMES = [
  "agentSpawn",
  "stop",
  "preToolUse",
  "postToolUse",
  "userPromptSubmit",
  "validation",
] as const;

/** @deprecated Use {@link WeaverEventName} instead. */
export type HookEventName = (typeof HOOK_EVENT_NAMES)[number];

// Raw hook event as received from kiro-cli via STDIN
export interface HookEventData {
  hook_event_name: HookEventName;
  cwd: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: {
    success: boolean;
    result: unknown[];
  };
}

/**
 * @deprecated Use {@link WeaverEvent} instead.
 * Timestamped wrapper written to per-session JSONL log files (legacy format).
 */
export interface HookEvent {
  timestamp: string;
  pid?: number;
  event: HookEventData;
}

// Matched pre/post tool use pair within a turn
export interface ToolCallPair {
  toolName: string;
  input: Record<string, unknown>;
  response?: HookEventData["tool_response"];
  startTime: string;
  endTime?: string;
}

// A logical conversation turn: user prompt → tool calls → stop
export interface TurnGroup {
  id: number;
  userPrompt: string | null;
  events: HookEvent[];
  toolCalls: ToolCallPair[];
  startTime: string;
  endTime: string;
  validationResults: ValidationResult[];
}

export const PENDING_APPROVAL_THRESHOLD_MS = 15_000;
