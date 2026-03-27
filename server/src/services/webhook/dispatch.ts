import type { WebhookPayload, SimpleWebhookPayload } from "./types";
import { log } from "../../utils/logger";

export async function dispatchWebhook(
  url: string,
  payload: WebhookPayload | SimpleWebhookPayload,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    log({
      timestamp: new Date().toISOString(),
      event: "webhook_error",
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}
