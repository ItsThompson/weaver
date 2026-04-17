import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ValidationResult, ValidationTrigger } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import { WEAVER_NOTIFY_URL } from "@weaver/shared/paths";
import { log } from "./utils/logger";

export function writeValidationEvent(
  sessionLogPath: string,
  sessionId: string,
  trigger: ValidationTrigger,
  results: ValidationResult[],
  changedFiles: string[],
  agentTestedDirs: string[],
  harness: Harness = Harness.KIRO_CLI,
): void {
  const entry: WeaverEvent = {
    sessionId,
    timestamp: new Date().toISOString(),
    harness,
    eventName: WeaverEventName.VALIDATION,
    validationTrigger: trigger,
    validationResults: results,
    validationChangedFiles: changedFiles,
    validationAgentTestedDirs: agentTestedDirs,
  };
  try {
    mkdirSync(dirname(sessionLogPath), { recursive: true });
    appendFileSync(sessionLogPath, JSON.stringify(entry) + "\n");
  } catch (e) {
    log({
      timestamp: new Date().toISOString(),
      event: "validation_event_write_error",
      path: sessionLogPath,
      error: String(e),
    });
  }

  // Fire-and-forget server notification
  fetch(WEAVER_NOTIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, eventName: "validation" }),
    signal: AbortSignal.timeout(1000),
  }).catch((err) =>
    log({
      timestamp: new Date().toISOString(),
      event: "notify_server_error",
      error: String(err),
    }),
  );
}
