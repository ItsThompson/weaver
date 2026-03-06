// Raw hook event as received from kiro-cli via STDIN
export interface HookEventData {
  hook_event_name: string;
  cwd: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: {
    success: boolean;
    result: unknown[];
  };
}

// Timestamped wrapper written to per-session JSONL log files
export interface HookEvent {
  timestamp: string;
  pid?: number;
  event: HookEventData;
}

// Matched pre/post tool use pair within a turn
export interface ToolCallPair {
  toolName: string;
  input: Record<string, unknown>;
  response?: HookEventData['tool_response'];
  startTime: string;
  endTime?: string;
}

// Enriched tool call data from SQLite
export interface ToolCallDetail {
  id: string;
  toolName: string;
  kind?: string;
  status: string;
  input?: string;
  output?: string;
  startedAt: string;
  completedAt?: string;
}

// A logical conversation turn: user prompt → tool calls → stop
export interface TurnGroup {
  id: number;
  userPrompt: string | null;
  events: HookEvent[];
  toolCalls: ToolCallPair[];
  startTime: string;
  endTime: string;
  assistantContent?: string;
  toolCallDetails?: ToolCallDetail[];
}

export const PENDING_APPROVAL_THRESHOLD_MS = 15_000;
