import { Harness, WeaverEventName } from "@weaver/shared/types";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  agentSpawn: WeaverEventName.AGENT_SPAWN,
  stop: WeaverEventName.STOP,
  preToolUse: WeaverEventName.PRE_TOOL_USE,
  postToolUse: WeaverEventName.POST_TOOL_USE,
  userPromptSubmit: WeaverEventName.USER_PROMPT_SUBMIT,
  validation: WeaverEventName.VALIDATION,
};

export function makeEvent(name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    sessionId: "test-session",
    timestamp: "2026-01-01T00:00:00Z",
    harness: Harness.KIRO_CLI,
    eventName: EVENT_NAME_MAP[name] ?? name,
    cwd: "/project",
    ...extra,
  });
}
