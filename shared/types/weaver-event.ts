import type { Harness } from "./harness";
import type { ValidationResult } from "./validation";

export enum WeaverEventName {
  // Shared across harnesses
  AGENT_SPAWN = "agentSpawn",
  STOP = "stop",
  PRE_TOOL_USE = "preToolUse",
  POST_TOOL_USE = "postToolUse",
  USER_PROMPT_SUBMIT = "userPromptSubmit",
  VALIDATION = "validation",
  // Claude Code specific
  SESSION_START = "SessionStart",
  SESSION_END = "SessionEnd",
  SUBAGENT_START = "SubagentStart",
  SUBAGENT_STOP = "SubagentStop",
  NOTIFICATION = "Notification",
  POST_TOOL_USE_FAILURE = "PostToolUseFailure",
  PERMISSION_REQUEST = "PermissionRequest",
  PERMISSION_DENIED = "PermissionDenied",
  TASK_CREATED = "TaskCreated",
  TASK_COMPLETED = "TaskCompleted",
  STOP_FAILURE = "StopFailure",
  TEAMMATE_IDLE = "TeammateIdle",
  CONFIG_CHANGE = "ConfigChange",
  PRE_COMPACT = "PreCompact",
  POST_COMPACT = "PostCompact",
}

export interface WeaverEvent {
  sessionId: string;
  timestamp: string;
  harness: Harness;
  eventName: WeaverEventName;
  cwd: string;
  pid?: number;
  transcriptPath?: string;
  prompt?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: { success: boolean; result: unknown[] };
  validationResults?: ValidationResult[];
  validationTrigger?: "stop" | "postToolUse";
  validationChangedFiles?: string[];
  validationAgentTestedDirs?: string[];
  permissionMode?: string;
  raw?: unknown;
}

const WEAVER_EVENT_NAME_VALUES = new Set<string>(
  Object.values(WeaverEventName),
);

/** Resolve a string event name to a WeaverEventName enum value. */
export function resolveEventName(name: string): WeaverEventName {
  if (WEAVER_EVENT_NAME_VALUES.has(name)) {
    return name as WeaverEventName;
  }
  throw new Error(`Unknown event name: "${name}"`);
}
