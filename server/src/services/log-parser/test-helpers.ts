import type { HookEvent } from "@weaver/shared/types";

export function makeEvent(
  name: string,
  extra: Record<string, unknown> = {},
): HookEvent {
  return {
    timestamp: new Date().toISOString(),
    event: { hook_event_name: name, cwd: "/tmp", ...extra },
  };
}

export function makeTimedEvent(
  name: string,
  ms: number,
  extra: Record<string, unknown> = {},
): HookEvent {
  return {
    timestamp: new Date(ms).toISOString(),
    event: { hook_event_name: name, cwd: "/tmp", ...extra },
  };
}

export function makeOrphanEvent(
  pid: number,
  name = "userPromptSubmit",
): HookEvent {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    pid,
    event: { hook_event_name: name, cwd: "/tmp" },
  };
}
