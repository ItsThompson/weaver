import type { WebhookPayload, SimpleWebhookPayload } from "./types";
import { log } from "../../utils/logger";

export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload | SimpleWebhookPayload,
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    log({
      timestamp: new Date().toISOString(),
      event: "webhook_error",
      error: String(err),
    });
  }
}
