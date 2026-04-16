import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  agentSpawn: WeaverEventName.AGENT_SPAWN,
  stop: WeaverEventName.STOP,
  preToolUse: WeaverEventName.PRE_TOOL_USE,
  postToolUse: WeaverEventName.POST_TOOL_USE,
  userPromptSubmit: WeaverEventName.USER_PROMPT_SUBMIT,
  validation: WeaverEventName.VALIDATION,
};

function resolveEventName(name: string): WeaverEventName {
  return EVENT_NAME_MAP[name] ?? (name as WeaverEventName);
}

export function makeEvent(
  name: string,
  extra: Record<string, unknown> = {},
): WeaverEvent {
  return {
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    harness: Harness.KIRO_CLI,
    eventName: resolveEventName(name),
    cwd: "/tmp",
    ...extra,
  };
}

export function makeTimedEvent(
  name: string,
  ms: number,
  extra: Record<string, unknown> = {},
): WeaverEvent {
  return {
    sessionId: "test-session",
    timestamp: new Date(ms).toISOString(),
    harness: Harness.KIRO_CLI,
    eventName: resolveEventName(name),
    cwd: "/tmp",
    ...extra,
  };
}

export function makeOrphanEvent(
  pid: number,
  name = "userPromptSubmit",
): WeaverEvent {
  return {
    sessionId: "orphan",
    timestamp: "2026-01-01T00:00:00Z",
    harness: Harness.KIRO_CLI,
    eventName: resolveEventName(name),
    cwd: "/tmp",
    pid,
  };
}
