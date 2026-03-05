import { PENDING_APPROVAL_THRESHOLD_MS, type ActivityStatus, type Session, type HookEvent, type WeaverConfig } from '@weaver/shared/types';
import type { WebhookPayload, SimpleWebhookPayload } from './types.js';
import { readConfig } from '../config/index.js';
import { parseLogFile, deriveActivity } from '../log-parser/index.js';
import { log } from '../../utils/logger.js';
import { buildWebhookPayload } from './payload-advanced.js';
import { buildSimpleWebhookPayload } from './payload-simple.js';
import { dispatchWebhook } from './dispatch.js';

const pendingTimers = new Map<string, NodeJS.Timeout>();
const enabledSessions = new Set<string>();

export function isWebhookEnabled(sessionId: string): boolean {
  return enabledSessions.has(sessionId);
}

export function setWebhookEnabled(sessionId: string, enabled: boolean): void {
  if (enabled) enabledSessions.add(sessionId);
  else enabledSessions.delete(sessionId);
}

function buildPayloadForFormat(
  format: WeaverConfig['webhook_format'],
  sessionId: string,
  eventName: string,
  activity: ActivityStatus,
  sessionName: string,
  session: Session | undefined,
  events: HookEvent[],
): WebhookPayload | SimpleWebhookPayload {
  if (format === 'simple') return buildSimpleWebhookPayload(eventName, activity, sessionName, events);
  return buildWebhookPayload(sessionId, eventName, activity, sessionName, session, events);
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
  if (!enabledSessions.has(sessionId)) return;

  const events = await parseLogFile(sessionId);
  const activity = deriveActivity(eventName);
  const payload = buildPayloadForFormat(config.webhook_format, sessionId, eventName, activity, sessionName, session, events);
  dispatchWebhook(config.webhook_url, payload);

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
        const pendingPayload = buildPayloadForFormat(freshConfig.webhook_format, sessionId, eventName, 'pending_approval', sessionName, session, freshEvents);
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
