import type { HookEventName } from "@weaver/shared/types";

export function makeEvent(
  hook_event_name: HookEventName,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    timestamp: "2026-01-01T00:00:00Z",
    event: { hook_event_name, cwd: "/project", ...extra },
  });
}
