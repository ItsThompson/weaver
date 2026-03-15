import { readdir, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Session } from "@weaver/shared/types";
import { log } from "../../utils/logger";
import { readSessions } from "./sessions";

const DATA_DIR = () => join(homedir(), ".weaver");

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PID_POLL_INTERVAL_MS = 30 * 1000;

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let pidPollInterval: ReturnType<typeof setInterval> | null = null;
const openPids = new Set<number>();

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Guard against PID reuse: verify the process is actually kiro-cli
  try {
    const args = execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf-8",
    });
    return args.includes("kiro-cli");
  } catch {
    return false;
  }
}

export async function cleanStaleSessions(): Promise<void> {
  const dataDir = DATA_DIR();
  let entries: string[];
  try {
    entries = await readdir(dataDir);
  } catch {
    return;
  }

  const sessionFiles = entries.filter((f) => f.startsWith(".current-session-"));

  const staleFiles = sessionFiles.reduce<{ file: string; pid: number }[]>(
    (acc, file) => {
      const pid = parseInt(file.replace(".current-session-", ""), 10);
      if (!isNaN(pid) && !isProcessRunning(pid)) {
        acc.push({ file, pid });
      }
      return acc;
    },
    [],
  );

  await Promise.all(
    staleFiles.map(async ({ file, pid }) => {
      try {
        await unlink(join(dataDir, file));
        log({
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
}

export function startStaleSessionCleanup(): void {
  cleanStaleSessions();
  cleanupInterval = setInterval(cleanStaleSessions, CLEANUP_INTERVAL_MS);
}

export function startPidPolling(
  onSessionClosed: (sessionId: string) => void,
): void {
  const poll = async () => {
    const sessions = await readSessions();
    const currentPids = sessions.reduce((acc, s) => {
      if (isProcessRunning(s.pid)) {
        acc.add(s.pid);
      }
      return acc;
    }, new Set<number>());

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
}

export function stopStaleSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (pidPollInterval) {
    clearInterval(pidPollInterval);
    pidPollInterval = null;
  }
}
