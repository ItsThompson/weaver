import type { HookEvent, Session } from "@weaver/shared/types";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

export const TEST_SESSION: Session = {
  id: "sess-1",
  pid: 111,
  customName: "my-project",
  cwd: "/Users/me/project",
  agentName: null,
  startTime: "2026-01-01T00:00:00Z",
  lastEventTime: "2026-01-01T00:01:00Z",
};

export function makeEvent(
  name: string,
  extra: Record<string, unknown> = {},
): HookEvent {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    event: { hook_event_name: name, cwd: "/tmp", ...extra },
  };
}

export function configWith(
  url: string,
  format: "simple" | "advanced" = "simple",
) {
  return {
    config: { ...DEFAULT_CONFIG, webhook_url: url, webhook_format: format },
    warnings: [],
  };
}
