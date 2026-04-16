import { Harness, resolveEventName } from "@weaver/shared/types";

export function makeEvent(name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    sessionId: "test-session",
    timestamp: "2026-01-01T00:00:00Z",
    harness: Harness.KIRO_CLI,
    eventName: resolveEventName(name),
    cwd: "/project",
    ...extra,
  });
}
