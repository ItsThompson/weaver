import type { ValidationResult } from "./validation";
import type { WeaverEvent } from "./weaver-event";

// Matched pre/post tool use pair within a turn
export interface ToolCallPair {
  toolName: string;
  input: Record<string, unknown>;
  response?: WeaverEvent["toolResponse"];
  startTime: string;
  endTime?: string;
}

// A logical conversation turn: user prompt → tool calls → stop
export interface TurnGroup {
  id: number;
  userPrompt: string | null;
  events: WeaverEvent[];
  toolCalls: ToolCallPair[];
  startTime: string;
  endTime: string;
  validationResults: ValidationResult[];
}

export const PENDING_APPROVAL_THRESHOLD_MS = 15_000;
