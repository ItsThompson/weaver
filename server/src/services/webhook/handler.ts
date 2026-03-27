import {
  PENDING_APPROVAL_THRESHOLD_MS,
  type ActivityStatus,
  type Session,
  type HookEvent,
  type WeaverConfig,
  type HookEventName,
} from "@weaver/shared/types";
import type { WebhookPayload, SimpleWebhookPayload } from "./types";
import { readConfig } from "../config/index";
import { parseLogFile, deriveActivity } from "../log-parser/index";
import { log } from "../../utils/logger";
import { buildWebhookPayload } from "./payload-advanced";
import { buildSimpleWebhookPayload } from "./payload-simple";
import { dispatchWebhook } from "./dispatch";
import { isWebhookEnabled } from "./session-tracker";
import { createPendingTracker } from "./pending-tracker";

const pendingTracker = createPendingTracker();

function buildPayloadForFormat(
  format: WeaverConfig["webhook_format"],
  sessionId: string,
  eventName: HookEventName,
  activity: ActivityStatus,
  sessionName: string,
  session: Session | undefined,
  events: HookEvent[],
): WebhookPayload | SimpleWebhookPayload {
  if (format === "simple") {
    return buildSimpleWebhookPayload(eventName, activity, sessionName, events);
  }
  return buildWebhookPayload(
    sessionId,
    eventName,
    activity,
    sessionName,
    session,
    events,
  );
}

export async function handleWebhookEvent(
  sessionId: string,
  eventName: HookEventName | undefined,
  sessionName: string,
  session: Session | undefined,
): Promise<void> {
  if (!eventName) {
    return;
  }

  const { config } = await readConfig();
  if (!config.webhook_url) {
    return;
  }
  if (!isWebhookEnabled(sessionId)) {
    return;
  }

  const events = await parseLogFile(sessionId);
  const activity = deriveActivity(eventName);
  const payload = buildPayloadForFormat(
    config.webhook_format,
    sessionId,
    eventName,
    activity,
    sessionName,
    session,
    events,
  );
  dispatchWebhook(config.webhook_url, payload);

  if (eventName === "postToolUse" || eventName === "stop") {
    pendingTracker.cancel(sessionId);
  } else if (eventName === "preToolUse") {
    pendingTracker.schedule(
      sessionId,
      PENDING_APPROVAL_THRESHOLD_MS,
      async () => {
        try {
          const { config: freshConfig } = await readConfig();
          if (!freshConfig.webhook_url) {
            return;
          }
          const freshEvents = await parseLogFile(sessionId);
          const pendingPayload = buildPayloadForFormat(
            freshConfig.webhook_format,
            sessionId,
            eventName,
            "pending_approval",
            sessionName,
            session,
            freshEvents,
          );
          dispatchWebhook(freshConfig.webhook_url, pendingPayload);
        } catch (err) {
          log({
            timestamp: new Date().toISOString(),
            event: "webhook_pending_error",
            error: String(err),
          });
        }
      },
    );
  }
}

export const stopWebhookTimers = () => pendingTracker.stopAll();
