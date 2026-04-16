import {
  PENDING_APPROVAL_THRESHOLD_MS,
  WeaverEventName,
} from "@weaver/shared/types";
import type { WeaverEvent, ActivityStatus } from "@weaver/shared/types";

export function deriveActivity(
  eventName: WeaverEventName,
  eventTimestamp?: string,
): ActivityStatus {
  switch (eventName) {
    case WeaverEventName.AGENT_SPAWN:
    case WeaverEventName.SESSION_START:
      return "starting";
    case WeaverEventName.STOP:
    case WeaverEventName.SESSION_END:
      return "idle";
    case WeaverEventName.PRE_TOOL_USE: {
      if (eventTimestamp) {
        const age = Date.now() - new Date(eventTimestamp).getTime();
        if (age > PENDING_APPROVAL_THRESHOLD_MS) {
          return "pending_approval";
        }
      }
      return "running_tool";
    }
    default:
      return "processing";
  }
}

/** Scans postToolUse fs_read events for SKILL.md paths and returns deduplicated skill file paths. */
export function extractActiveSkillPaths(events: WeaverEvent[]): string[] {
  const paths = new Set<string>();

  events.forEach((event) => {
    if (
      event.eventName !== WeaverEventName.POST_TOOL_USE ||
      event.toolName !== "fs_read"
    ) {
      return;
    }

    const operations = event.toolInput?.operations;
    if (!Array.isArray(operations)) {
      return;
    }

    operations.forEach((op: { path?: string }) => {
      if (op.path?.includes("/skills/") && op.path.endsWith("SKILL.md")) {
        paths.add(op.path);
      }
    });
  });

  return [...paths];
}
