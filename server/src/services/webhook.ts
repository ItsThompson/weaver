import { PENDING_APPROVAL_THRESHOLD_MS, type ActivityStatus, type Session, type HookEvent } from '@weaver/shared/types';
import { readConfig } from './config.js';
import { parseLogFile, deriveActivity } from './log-parser.js';
import { log } from '../utils/logger.js';

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
  source: 'weaver';
}

const pendingTimers = new Map<string, NodeJS.Timeout>();

export function buildWebhookPayload(
  sessionId: string,
  eventName: string,
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
    session_cwd: session?.cwd ?? '',
    prompt: ctx?.prompt ?? null,
    tool_name: ctx?.tool_name ?? null,
    tool_input: ctx?.tool_input ? JSON.stringify(ctx.tool_input) : null,
    tool_response: ctx?.tool_response ? JSON.stringify(ctx.tool_response) : null,
    source: 'weaver',
  };
}

interface EventContext {
  prompt: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_response: { success: boolean; result: unknown[] } | null;
}

function extractContext(eventName: string, events: HookEvent[]): EventContext | null {
  if (eventName === 'agentSpawn' || eventName === 'stop') return null;

  // Find the most recent userPromptSubmit for the current turn's prompt
  const lastPromptEvent = findLastByName(events, 'userPromptSubmit');
  const prompt = lastPromptEvent?.event.prompt ?? null;

  if (eventName === 'userPromptSubmit') {
    return { prompt, tool_name: null, tool_input: null, tool_response: null };
  }

  // preToolUse / postToolUse — find the last matching event in the log
  const toolEvent = findLastByName(events, eventName);
  return {
    prompt,
    tool_name: toolEvent?.event.tool_name ?? null,
    tool_input: toolEvent?.event.tool_input ?? null,
    tool_response: (eventName === 'postToolUse' && toolEvent?.event.tool_response) ? toolEvent.event.tool_response : null,
  };
}

function findLastByName(events: HookEvent[], name: string): HookEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event.hook_event_name === name) return events[i];
  }
  return undefined;
}

export async function dispatchWebhook(url: string, payload: WebhookPayload): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    log({ timestamp: new Date().toISOString(), event: 'webhook_error', error: String(err) });
  }
}

export async function handleWebhookEvent(
  sessionId: string,
  eventName: string | undefined,
  sessionName: string,
  session: Session | undefined,
): Promise<void> {
  if (!eventName) return;

  const { config } = await readConfig();
  if (!config.webhook_url) return;

  const events = await parseLogFile(sessionId);
  const activity = deriveActivity(eventName);
  const payload = buildWebhookPayload(sessionId, eventName, activity, sessionName, session, events);
  dispatchWebhook(config.webhook_url, payload);

  // Pending approval timer management
  if (eventName === 'postToolUse' || eventName === 'stop') {
    clearPendingTimer(sessionId);
  } else if (eventName === 'preToolUse') {
    clearPendingTimer(sessionId);
    pendingTimers.set(sessionId, setTimeout(async () => {
      pendingTimers.delete(sessionId);
      try {
        const { config: freshConfig } = await readConfig();
        if (!freshConfig.webhook_url) return;
        const freshEvents = await parseLogFile(sessionId);
        const pendingPayload = buildWebhookPayload(sessionId, eventName, 'pending_approval', sessionName, session, freshEvents);
        dispatchWebhook(freshConfig.webhook_url, pendingPayload);
      } catch (err) {
        log({ timestamp: new Date().toISOString(), event: 'webhook_pending_error', error: String(err) });
      }
    }, PENDING_APPROVAL_THRESHOLD_MS));
  }
}

function clearPendingTimer(sessionId: string): void {
  const timer = pendingTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(sessionId);
  }
}

export function stopWebhookTimers(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
}
