import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { log } from "../utils/logger";

export interface ManagedProcessConfig {
  name: string;
  cleanup: { type: "port"; port: number } | { type: "pidfile"; path: string };
  gracePeriodMs?: number;
  inactivityTimeoutMs?: number;
}

export interface ManagedProcess {
  start(
    command: string,
    args: string[],
    opts?: Record<string, unknown>,
  ): ChildProcess;
  stop(): void;
  isAlive(): boolean;
  touch(): void;
  getChild(): ChildProcess | null;
}

const DEFAULT_GRACE_MS = 2000;

function killOrphansByPort(
  port: number,
  currentPid: number | undefined,
  eventName: string,
): void {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf8",
    }).trim();
    if (!output) {
      return;
    }
    output.split("\n").forEach((pidStr) => {
      const pid = Number(pidStr);
      if (pid && pid !== currentPid) {
        process.kill(pid, "SIGTERM");
        log({
          timestamp: new Date().toISOString(),
          event: eventName,
          pid,
        });
      }
    });
  } catch {
    // No process on port
  }
}

function killOrphansByPidFile(path: string, eventName: string): void {
  try {
    const pid = Number(readFileSync(path, "utf8").trim());
    if (!pid) {
      return;
    }
    process.kill(pid, "SIGTERM");
    log({
      timestamp: new Date().toISOString(),
      event: eventName,
      pid,
    });
  } catch {
    // File doesn't exist or process already gone
  } finally {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

export function createManagedProcess(
  config: ManagedProcessConfig,
): ManagedProcess {
  const { name, cleanup, gracePeriodMs = DEFAULT_GRACE_MS } = config;
  let child: ChildProcess | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  function clearInactivityTimer(): void {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function startInactivityTimer(): void {
    if (!config.inactivityTimeoutMs) {
      return;
    }
    clearInactivityTimer();
    inactivityTimer = setTimeout(() => {
      log({
        timestamp: new Date().toISOString(),
        event: `${name}_inactivity_timeout`,
      });
      stop();
    }, config.inactivityTimeoutMs);
  }

  function killOrphans(): void {
    const eventName = `${name}_killed_stale_process`;
    if (cleanup.type === "port") {
      killOrphansByPort(cleanup.port, child?.pid, eventName);
    } else {
      killOrphansByPidFile(cleanup.path, eventName);
    }
  }

  function writePidFile(pid: number): void {
    if (cleanup.type !== "pidfile") {
      return;
    }
    try {
      writeFileSync(cleanup.path, String(pid));
    } catch {
      // non-critical
    }
  }

  function removePidFile(): void {
    if (cleanup.type !== "pidfile") {
      return;
    }
    try {
      unlinkSync(cleanup.path);
    } catch {
      // ignore
    }
  }

  function start(
    command: string,
    args: string[],
    opts?: Record<string, unknown>,
  ): ChildProcess {
    if (child) {
      return child;
    }

    killOrphans();

    const spawned = spawn(command, args, opts);
    child = spawned;

    spawned.on("exit", (code, signal) => {
      log({
        timestamp: new Date().toISOString(),
        event: `${name}_exited`,
        code,
        signal,
      });
      child = null;
      clearInactivityTimer();
      removePidFile();
    });

    log({
      timestamp: new Date().toISOString(),
      event: `${name}_started`,
      pid: spawned.pid,
    });

    writePidFile(spawned.pid!);
    startInactivityTimer();

    return spawned;
  }

  function stop(): void {
    if (!child) {
      return;
    }

    const ref = child;
    child = null;
    clearInactivityTimer();
    removePidFile();

    ref.kill("SIGTERM");
    const timeout = setTimeout(() => {
      if (!ref.killed) {
        ref.kill("SIGKILL");
      }
    }, gracePeriodMs);
    ref.on("exit", () => clearTimeout(timeout));
  }

  function isAlive(): boolean {
    return child !== null;
  }

  function touch(): void {
    if (child) {
      startInactivityTimer();
    }
  }

  function getChild(): ChildProcess | null {
    return child;
  }

  return { start, stop, isAlive, touch, getChild };
}
