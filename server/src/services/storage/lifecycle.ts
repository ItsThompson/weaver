import { readdir, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Session } from "@weaver/shared/types";
import { weaverDir } from "@weaver/shared/paths";
import { log } from "../../utils/logger";
import { readSessions } from "./sessions";

const execFileAsync = promisify(execFile);

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const PID_POLL_INTERVAL_MS = 30 * 1000;

let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let pidPollInterval: ReturnType<typeof setInterval> | null = null;
const openPids = new Set<number>();

export async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // Guard against PID reuse: verify the process is actually kiro-cli
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
}

export async function cleanStaleSessions(): Promise<void> {
  const dataDir = weaverDir();
  let entries: string[];
  try {
    entries = await readdir(dataDir);
  } catch {
    return;
  }

  const sessionFiles = entries.filter((f) => f.startsWith(".current-session-"));

  const checked = await Promise.all(
    sessionFiles.map(async (file) => {
      const pid = parseInt(file.replace(".current-session-", ""), 10);
      if (isNaN(pid)) {
        return null;
      }
      const alive = await isProcessRunning(pid);
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
    const results = await Promise.all(
      sessions.map(async (s) => ({
        session: s,
        alive: await isProcessRunning(s.pid),
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
