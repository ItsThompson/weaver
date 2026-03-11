import type { ActivityStatus, HookEvent } from "@weaver/shared/types";
import type { SimpleWebhookPayload, EventContext } from "./types.js";
import { extractContext } from "./context.js";

export function buildSimpleWebhookPayload(
  eventName: string,
  activity: ActivityStatus,
  sessionName: string,
  events: HookEvent[],
): SimpleWebhookPayload {
  const ctx = extractContext(eventName, events);
  return { text: formatText(eventName, activity, sessionName, ctx) };
}

function formatText(
  eventName: string,
  activity: ActivityStatus,
  name: string,
  ctx: EventContext | null,
): string {
  const toolSummary = ctx?.tool_name
    ? `${ctx.tool_name}${summarizeToolInput(ctx.tool_input)}`
    : "";

  if (eventName === "agentSpawn") {
    return `🟢 ${name} started`;
  }
  if (eventName === "stop") {
    return `⚫ ${name} idle`;
  }
  if (eventName === "userPromptSubmit") {
    return `💬 ${name} ── ${truncate(ctx?.prompt ?? "", 200)}`;
  }

  if (activity === "pending_approval") {
    let text = `⏳ ${name} ── ${toolSummary} waiting for approval`;
    if (ctx?.prompt) {
      text += `\n💬 ${truncate(ctx.prompt, 200)}`;
    }
    return text;
  }

  if (eventName === "postToolUse") {
    return `✅ ${name} ── ${toolSummary}`;
  }
  if (eventName === "preToolUse") {
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
