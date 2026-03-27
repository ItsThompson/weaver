import type {
  ActivityStatus,
  Session,
  HookEvent,
  HookEventName,
} from "@weaver/shared/types";
import type { WebhookPayload } from "./types";
import { extractContext } from "./context";

export function buildWebhookPayload(
  sessionId: string,
  eventName: HookEventName,
  activity: ActivityStatus,
  sessionName: string,
  session: Session | undefined,
  events: HookEvent[],
): WebhookPayload {
  const ctx = extractContext(eventName, events);
  return {
    event: eventName,
    activity,
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    session_name: sessionName,
    session_pid: session?.pid ?? 0,
    session_cwd: session?.cwd ?? "",
    prompt: ctx?.prompt ?? null,
    tool_name: ctx?.tool_name ?? null,
    tool_input: ctx?.tool_input ? JSON.stringify(ctx.tool_input) : null,
    tool_response: ctx?.tool_response
      ? JSON.stringify(ctx.tool_response)
      : null,
    source: "weaver",
  };
}
