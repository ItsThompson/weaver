import { execFile } from "node:child_process";
import { readSessions, isProcessRunning } from "./storage/index";
import { getLastEvent, deriveActivity } from "./log-parser/index";
import { log } from "../utils/logger";

const POLL_INTERVAL_MS = 60_000;
const ACTIVE_STATES = new Set(["processing", "running_tool"]);

let interval: ReturnType<typeof setInterval> | null = null;

async function hasActiveSessions(): Promise<boolean> {
  const sessions = await readSessions();
  for (const s of sessions) {
    if (!isProcessRunning(s.pid)) {
      continue;
    }
    const last = await getLastEvent(s.id);
    const activity = deriveActivity(
      last?.name ?? "agentSpawn",
      last?.timestamp,
    );
    if (ACTIVE_STATES.has(activity)) {
      return true;
    }
  }
  return false;
}

export function startKeepAwake(scriptPath: string): void {
  const poll = async () => {
    try {
      const active = await hasActiveSessions();
      log({
        timestamp: new Date().toISOString(),
        event: "keep_awake_poll",
        active,
      });
      if (active) {
        execFile("bash", [scriptPath], (err) => {
          if (err) {
            log({
              timestamp: new Date().toISOString(),
              event: "keep_awake_error",
              error: String(err),
            });
          }
        });
      }
    } catch (err) {
      log({
        timestamp: new Date().toISOString(),
        event: "keep_awake_poll_error",
        error: String(err),
      });
    }
  };

  poll();
  interval = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopKeepAwake(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
