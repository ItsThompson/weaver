import type { TurnGroup } from "./events";

// Session stored in sessions.jsonl (one JSON line per session)
export interface Session {
  id: string;
  pid: number;
  customName: string | null;
  cwd: string;
  agentName: string | null;
  startTime: string;
  lastEventTime: string;
}

// Computed at runtime by checking if pid is still running
export type ActivityStatus =
  | "starting"
  | "idle"
  | "processing"
  | "running_tool"
  | "pending_approval";

export interface SessionWithStatus extends Session {
  status: "open" | "closed";
  activity?: ActivityStatus;
}

// Standard error shape returned by API routes
export interface ApiError {
  error: string;
  fieldErrors?: Record<string, Record<string, string>>;
}

// Orphaned events grouped by the PID that produced them
export interface OrphanGroup {
  pid: number;
  turns: TurnGroup[];
  eventCount: number;
  timeRange: { start: string; end: string };
}
