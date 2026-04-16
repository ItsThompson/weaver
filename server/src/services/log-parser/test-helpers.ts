import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, resolveEventName } from "@weaver/shared/types";

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
