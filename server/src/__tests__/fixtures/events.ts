import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";

const T0 = "2026-01-02T00:00:00Z";
const T1 = "2026-01-02T00:00:01Z";
const T2 = "2026-01-02T00:00:02Z";
const T3 = "2026-01-02T00:00:03Z";
const T4 = "2026-01-02T00:00:04Z";
const T5 = "2026-01-02T00:00:05Z";

function evt(
  timestamp: string,
  eventName: WeaverEventName,
  extra: Partial<WeaverEvent> = {},
): WeaverEvent {
  return {
    sessionId: "test-session",
    timestamp,
    harness: Harness.KIRO_CLI,
    eventName,
    cwd: "/tmp",
    ...extra,
  };
}

/** Three turns: agentSpawn, stop flush, then userPrompt → preToolUse → postToolUse → stop */
export const MULTI_TURN_EVENTS: WeaverEvent[] = [
  evt(T0, WeaverEventName.AGENT_SPAWN),
  evt(T1, WeaverEventName.STOP),
  evt(T2, WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "read the file" }),
  evt(T3, WeaverEventName.PRE_TOOL_USE, { toolName: "fs_read" }),
  evt(T4, WeaverEventName.POST_TOOL_USE, {
    toolName: "fs_read",
    toolResponse: { success: true, result: ["file content"] },
  }),
  evt(T5, WeaverEventName.STOP),
];

/** Events containing a postToolUse fs_read of a SKILL.md file */
export const SKILL_READ_EVENTS: WeaverEvent[] = [
  evt(T0, WeaverEventName.AGENT_SPAWN),
  evt(T1, WeaverEventName.POST_TOOL_USE, {
    toolName: "fs_read",
    toolInput: {
      operations: [{ path: "/home/.kiro/skills/coding-practices/SKILL.md" }],
    },
  }),
  evt(T2, WeaverEventName.STOP),
];
