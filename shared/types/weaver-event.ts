import type { Harness } from "./harness";
import type { ValidationResult } from "./validation";

/**
 * Canonical event names across all harnesses.
 *
 * Values use kebab-case as the single canonical format. Adapters translate
 * from each harness's native format (kiro-cli camelCase, Claude Code
 * PascalCase) into these canonical values.
 */
export enum WeaverEventName {
  // Shared across harnesses
  AGENT_SPAWN = "agent-spawn",
  STOP = "stop",
  PRE_TOOL_USE = "pre-tool-use",
  POST_TOOL_USE = "post-tool-use",
  USER_PROMPT_SUBMIT = "user-prompt-submit",
  VALIDATION = "validation",
  // Claude Code specific
  SESSION_START = "session-start",
  SESSION_END = "session-end",
  SUBAGENT_START = "subagent-start",
  SUBAGENT_STOP = "subagent-stop",
  NOTIFICATION = "notification",
  POST_TOOL_USE_FAILURE = "post-tool-use-failure",
  PERMISSION_REQUEST = "permission-request",
  PERMISSION_DENIED = "permission-denied",
  TASK_CREATED = "task-created",
  TASK_COMPLETED = "task-completed",
  STOP_FAILURE = "stop-failure",
  TEAMMATE_IDLE = "teammate-idle",
  CONFIG_CHANGE = "config-change",
  PRE_COMPACT = "pre-compact",
  POST_COMPACT = "post-compact",
}

export interface WeaverEvent {
  sessionId: string;
  timestamp: string;
  harness: Harness;
  eventName: WeaverEventName;
  cwd?: string;
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

/**
 * Maps pre-canonical event name strings (kiro-cli camelCase, Claude Code
 * PascalCase) to their canonical WeaverEventName. Used by resolveEventName
 * to accept legacy strings from old logs and test helpers.
 */
const LEGACY_EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  // kiro-cli camelCase
  agentSpawn: WeaverEventName.AGENT_SPAWN,
  preToolUse: WeaverEventName.PRE_TOOL_USE,
  postToolUse: WeaverEventName.POST_TOOL_USE,
  userPromptSubmit: WeaverEventName.USER_PROMPT_SUBMIT,
  // Claude Code PascalCase
  SessionStart: WeaverEventName.SESSION_START,
  SessionEnd: WeaverEventName.SESSION_END,
  SubagentStart: WeaverEventName.SUBAGENT_START,
  SubagentStop: WeaverEventName.SUBAGENT_STOP,
  Notification: WeaverEventName.NOTIFICATION,
  PostToolUseFailure: WeaverEventName.POST_TOOL_USE_FAILURE,
  PermissionRequest: WeaverEventName.PERMISSION_REQUEST,
  PermissionDenied: WeaverEventName.PERMISSION_DENIED,
  TaskCreated: WeaverEventName.TASK_CREATED,
  TaskCompleted: WeaverEventName.TASK_COMPLETED,
  StopFailure: WeaverEventName.STOP_FAILURE,
  TeammateIdle: WeaverEventName.TEAMMATE_IDLE,
  ConfigChange: WeaverEventName.CONFIG_CHANGE,
  PreCompact: WeaverEventName.PRE_COMPACT,
  PostCompact: WeaverEventName.POST_COMPACT,
};

/**
 * Resolve a string event name to a WeaverEventName enum value.
 * Accepts canonical kebab-case values and legacy harness-native strings.
 */
export function resolveEventName(name: string): WeaverEventName {
  if (WEAVER_EVENT_NAME_VALUES.has(name)) {
    return name as WeaverEventName;
  }
  const legacy = LEGACY_EVENT_NAME_MAP[name];
  if (legacy) {
    return legacy;
  }
  throw new Error(`Unknown event name: "${name}"`);
}
