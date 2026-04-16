import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ValidationEvent, ValidationResult } from "@weaver/shared/types";
import { log } from "./utils/logger";

export function writeValidationEvent(
  sessionLogPath: string,
  sessionId: string,
  trigger: "stop" | "postToolUse",
  results: ValidationResult[],
  changedFiles: string[],
  agentTestedDirs: string[],
): void {
  const event: ValidationEvent = {
    hook_event_name: "validation",
    trigger,
    results,
    changed_files: changedFiles,
    agent_tested_dirs: agentTestedDirs,
  };
  const logEntry = { timestamp: new Date().toISOString(), event };
  try {
    mkdirSync(dirname(sessionLogPath), { recursive: true });
    appendFileSync(sessionLogPath, JSON.stringify(logEntry) + "\n");
  } catch (e) {
    log({
      timestamp: new Date().toISOString(),
      event: "validation_event_write_error",
      path: sessionLogPath,
      error: String(e),
    });
  }

  // Fire-and-forget server notification
  fetch("http://localhost:8143/api/notify", {
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
