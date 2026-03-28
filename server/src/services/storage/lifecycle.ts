import { readdir, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Session } from "@weaver/shared/types";
import type { LogEntry } from "../../utils/logger";
import { readSessions } from "./sessions";
import { log } from "../../utils/logger";
import { weaverDir } from "@weaver/shared/paths";

const execFileAsync = promisify(execFile);

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PID_POLL_INTERVAL_MS = 30 * 1000;

export interface LifecycleManager {
  isProcessRunning(pid: number): Promise<boolean>;
  cleanStaleSessions(): Promise<void>;
  startStaleSessionCleanup(): void;
  startPidPolling(onSessionClosed: (sessionId: string) => void): void;
  stopStaleSessionCleanup(): void;
}

export interface LifecycleDeps {
  readSessions: () => Promise<Session[]>;
  log: (entry: LogEntry) => void;
  weaverDir: () => string;
}

export function createLifecycleManager(deps: LifecycleDeps): LifecycleManager {
  let cleanupInterval: ReturnType<typeof setInterval> | null = null;
  let pidPollInterval: ReturnType<typeof setInterval> | null = null;
  const openPids = new Set<number>();

  const manager: LifecycleManager = {
    async isProcessRunning(pid: number): Promise<boolean> {
      try {
        process.kill(pid, 0);
      } catch {
        return false;
      }
      try {
        const { stdout } = await execFileAsync("ps", [
          "-p",
          String(pid),
          "-o",
          "args=",
        ]);
        return stdout.includes("kiro-cli");
      } catch {
        return false;
      }
    },

    async cleanStaleSessions(): Promise<void> {
      const dataDir = deps.weaverDir();
      let entries: string[];
      try {
        entries = await readdir(dataDir);
      } catch {
        return;
      }

      const sessionFiles = entries.filter((f) =>
        f.startsWith(".current-session-"),
      );

      const checked = await Promise.all(
        sessionFiles.map(async (file) => {
          const pid = parseInt(file.replace(".current-session-", ""), 10);
          if (isNaN(pid)) {
            return null;
          }
          const alive = await manager.isProcessRunning(pid);
          return alive ? null : { file, pid };
        }),
      );
      const staleFiles = checked.filter(
        (entry): entry is { file: string; pid: number } => entry !== null,
      );

      await Promise.all(
        staleFiles.map(async ({ file, pid }) => {
          try {
            await unlink(join(dataDir, file));
            deps.log({
              timestamp: new Date().toISOString(),
              event: "stale_session_cleaned",
              pid,
              file,
            });
          } catch {
            // File may have been removed between readdir and unlink
          }
        }),
      );
    },

    startStaleSessionCleanup(): void {
      manager.cleanStaleSessions();
      cleanupInterval = setInterval(
        () => manager.cleanStaleSessions(),
        CLEANUP_INTERVAL_MS,
      );
    },

    startPidPolling(onSessionClosed: (sessionId: string) => void): void {
      const poll = async () => {
        const sessions = await deps.readSessions();
        const results = await Promise.all(
          sessions.map(async (s) => ({
            session: s,
            alive: await manager.isProcessRunning(s.pid),
          })),
        );
        const currentPids = new Set(
          results.filter((r) => r.alive).map((r) => r.session.pid),
        );

        openPids.forEach((pid) => {
          if (currentPids.has(pid)) {
            return;
          }
          const session = sessions.find((s) => s.pid === pid);
          if (session) {
            onSessionClosed(session.id);
          }
        });

        openPids.clear();
        currentPids.forEach((pid) => openPids.add(pid));
      };

      poll();
      pidPollInterval = setInterval(poll, PID_POLL_INTERVAL_MS);
    },

    stopStaleSessionCleanup(): void {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }
      if (pidPollInterval) {
        clearInterval(pidPollInterval);
        pidPollInterval = null;
      }
    },
  };

  return manager;
}

const defaultManager = createLifecycleManager({ readSessions, log, weaverDir });
export const {
  isProcessRunning,
  cleanStaleSessions,
  startStaleSessionCleanup,
  startPidPolling,
  stopStaleSessionCleanup,
} = defaultManager;
