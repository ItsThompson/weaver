import type { ActivityStatus } from "@weaver/shared/types";

export const ACTIVITY_COLORS: Record<ActivityStatus, string> = {
  starting: "#888",
  idle: "#2ea043",
  processing: "#d29922",
  running_tool: "#58a6ff",
  pending_approval: "#f85149",
};
