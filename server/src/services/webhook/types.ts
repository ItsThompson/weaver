import type { ActivityStatus } from "@weaver/shared/types";

export interface WebhookPayload {
  event: string;
  activity: ActivityStatus;
  timestamp: string;
  session_id: string;
  session_name: string;
  session_pid: number;
  session_cwd: string;
  prompt: string | null;
  tool_name: string | null;
  tool_input: string | null;
  tool_response: string | null;
  source: "weaver";
}

export interface SimpleWebhookPayload {
  text: string;
}

export interface EventContext {
  prompt: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_response: { success: boolean; result: unknown[] } | null;
}
