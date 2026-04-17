import type { ActivityStatus, WeaverEvent } from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";
import type { SimpleWebhookPayload, EventContext } from "./types";
import { extractContext } from "./context";

export function buildSimpleWebhookPayload(
  eventName: WeaverEventName,
  activity: ActivityStatus,
  sessionName: string,
  events: WeaverEvent[],
): SimpleWebhookPayload {
  const ctx = extractContext(eventName, events);
  return { text: formatText(eventName, activity, sessionName, ctx) };
}

function formatText(
  eventName: WeaverEventName,
  activity: ActivityStatus,
  name: string,
  ctx: EventContext | null,
): string {
  const toolSummary = ctx?.tool_name
    ? `${ctx.tool_name}${summarizeToolInput(ctx.tool_input)}`
    : "";

  if (eventName === WeaverEventName.AGENT_SPAWN) {
    return `🟢 ${name} started`;
  }
  if (eventName === WeaverEventName.STOP) {
    return `⚫ ${name} idle`;
  }
  if (eventName === WeaverEventName.USER_PROMPT_SUBMIT) {
    return `💬 ${name} ── ${truncate(ctx?.prompt ?? "", 200)}`;
  }

  if (activity === "pending_approval") {
    let text = `⏳ ${name} ── ${toolSummary} waiting for approval`;
    if (ctx?.prompt) {
      text += `\n💬 ${truncate(ctx.prompt, 200)}`;
    }
    return text;
  }

  if (eventName === WeaverEventName.POST_TOOL_USE) {
    return `✅ ${name} ── ${toolSummary}`;
  }
  if (eventName === WeaverEventName.PRE_TOOL_USE) {
    return `🔧 ${name} ── ${toolSummary}`;
  }

  return `${name} ── ${eventName}`;
}

function summarizeToolInput(input: Record<string, unknown> | null): string {
  if (!input) {
    return "";
  }
  const summary =
    input.path ??
    input.command ??
    input.pattern ??
    input.file_path ??
    input.url ??
    input.query;
  if (typeof summary === "string") {
    return ` ── ${truncate(summary, 120)}`;
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
