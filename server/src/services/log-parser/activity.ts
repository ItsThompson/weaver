import { PENDING_APPROVAL_THRESHOLD_MS } from "@weaver/shared/types";
import type {
  HookEvent,
  ActivityStatus,
  HookEventName,
} from "@weaver/shared/types";

export function deriveActivity(
  eventName: HookEventName,
  eventTimestamp?: string,
): ActivityStatus {
  switch (eventName) {
    case "agentSpawn":
      return "starting";
    case "stop":
      return "idle";
    case "preToolUse": {
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
export function extractActiveSkillPaths(events: HookEvent[]): string[] {
  const paths = new Set<string>();

  events.forEach((event) => {
    const { hook_event_name, tool_name, tool_input } = event.event;
    if (hook_event_name !== "postToolUse" || tool_name !== "fs_read") {
      return;
    }

    const operations = tool_input?.operations;
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
