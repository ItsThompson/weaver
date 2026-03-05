import { PENDING_APPROVAL_THRESHOLD_MS, type ActivityStatus, type Session, type HookEvent } from '@weaver/shared/types';
import { readConfig } from './config.js';
import { parseLogFile, deriveActivity } from './log-parser.js';
import { log } from '../utils/logger.js';

export interface WebhookPayload {
  event: string;
  activity: ActivityStatus;
  timestamp: string;
  session: { id: string; name: string; pid: number; cwd: string };
  context: Record<string, unknown> | null;
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
  return {
    event: eventName,
    activity,
    timestamp: new Date().toISOString(),
    session: {
      id: sessionId,
      name: sessionName,
      pid: session?.pid ?? 0,
      cwd: session?.cwd ?? '',
    },
    context: extractContext(eventName, events),
    source: 'weaver',
  };
}

function extractContext(eventName: string, events: HookEvent[]): Record<string, unknown> | null {
  if (eventName === 'agentSpawn' || eventName === 'stop') return null;

  // Find the most recent userPromptSubmit for the current turn's prompt
  const lastPromptEvent = findLastByName(events, 'userPromptSubmit');
  const prompt = lastPromptEvent?.event.prompt ?? null;

  if (eventName === 'userPromptSubmit') {
    return { prompt };
  }

  // preToolUse / postToolUse — find the last matching event in the log
  const toolEvent = findLastByName(events, eventName);
  if (!toolEvent) return { prompt };

  const ctx: Record<string, unknown> = {
    prompt,
    tool_name: toolEvent.event.tool_name ?? null,
    tool_input: toolEvent.event.tool_input ?? null,
  };

  if (eventName === 'postToolUse' && toolEvent.event.tool_response) {
    ctx.tool_response = toolEvent.event.tool_response;
  }

  return ctx;
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
