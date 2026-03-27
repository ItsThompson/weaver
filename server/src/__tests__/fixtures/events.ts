import type { HookEvent } from "@weaver/shared/types";

const T0 = "2026-01-02T00:00:00Z";
const T1 = "2026-01-02T00:00:01Z";
const T2 = "2026-01-02T00:00:02Z";
const T3 = "2026-01-02T00:00:03Z";
const T4 = "2026-01-02T00:00:04Z";
const T5 = "2026-01-02T00:00:05Z";

function evt(
  timestamp: string,
  hook_event_name: HookEvent["event"]["hook_event_name"],
  extra: Record<string, unknown> = {},
): HookEvent {
  return { timestamp, event: { hook_event_name, cwd: "/tmp", ...extra } };
}

/** Two turns: agentSpawn, then userPrompt → preToolUse → postToolUse → stop */
export const MULTI_TURN_EVENTS: HookEvent[] = [
  evt(T0, "agentSpawn"),
  evt(T1, "stop"),
  evt(T2, "userPromptSubmit", { prompt: "read the file" }),
  evt(T3, "preToolUse", { tool_name: "fs_read" }),
  evt(T4, "postToolUse", {
    tool_name: "fs_read",
    tool_response: { success: true, result: ["file content"] },
  }),
  evt(T5, "stop"),
];

/** Events containing a postToolUse fs_read of a SKILL.md file */
export const SKILL_READ_EVENTS: HookEvent[] = [
  evt(T0, "agentSpawn"),
  evt(T1, "postToolUse", {
    tool_name: "fs_read",
    tool_input: {
      operations: [{ path: "/home/.kiro/skills/coding-practices/SKILL.md" }],
    },
  }),
  evt(T2, "stop"),
];
