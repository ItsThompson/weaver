import { execFile } from "node:child_process";
import type { Session } from "@weaver/shared/types";
import { readSessions, isProcessRunning } from "./storage/index";
import { getLastEvent, deriveActivity } from "./log-parser/index";
import { log as defaultLog } from "../utils/logger";
import type { LogEntry } from "../utils/logger";
import type { LastEvent } from "./log-parser/types";
import type { HookEventName, ActivityStatus } from "@weaver/shared/types";

const POLL_INTERVAL_MS = 60_000;
const ACTIVE_STATES = new Set(["processing", "running_tool"]);

export interface KeepAwakeDeps {
  readSessions: () => Promise<Session[]>;
  isProcessRunning: (pid: number) => Promise<boolean>;
  getLastEvent: (sessionId: string) => Promise<LastEvent | null>;
  deriveActivity: (
    eventName: HookEventName,
    timestamp?: string,
  ) => ActivityStatus;
  log: (entry: LogEntry) => void;
}

export interface KeepAwake {
  startKeepAwake: (scriptPath: string) => void;
  stopKeepAwake: () => void;
}

export function createKeepAwake(deps: KeepAwakeDeps): KeepAwake {
  let interval: ReturnType<typeof setInterval> | null = null;

  async function hasActiveSessions(): Promise<boolean> {
    const sessions = await deps.readSessions();
    for (const s of sessions) {
      if (!(await deps.isProcessRunning(s.pid))) {
        continue;
      }
      const last = await deps.getLastEvent(s.id);
      const activity = deps.deriveActivity(
        last?.name ?? "agentSpawn",
        last?.timestamp,
      );
      if (ACTIVE_STATES.has(activity)) {
        return true;
      }
    }
    return false;
  }

  return {
    startKeepAwake(scriptPath: string): void {
      const poll = async () => {
        try {
          const active = await hasActiveSessions();
          deps.log({
            timestamp: new Date().toISOString(),
            event: "keep_awake_poll",
            active,
          });
          if (active) {
            execFile("bash", [scriptPath], (err) => {
              if (err) {
                deps.log({
                  timestamp: new Date().toISOString(),
                  event: "keep_awake_error",
                  error: String(err),
                });
              }
            });
          }
        } catch (err) {
          deps.log({
            timestamp: new Date().toISOString(),
            event: "keep_awake_poll_error",
            error: String(err),
          });
        }
      };

      poll();
      interval = setInterval(poll, POLL_INTERVAL_MS);
    },

    stopKeepAwake(): void {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}

const defaultKeepAwake = createKeepAwake({
  readSessions,
  isProcessRunning,
  getLastEvent,
  deriveActivity,
  log: defaultLog,
});
export const { startKeepAwake, stopKeepAwake } = defaultKeepAwake;
