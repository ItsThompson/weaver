import { spawn, type ChildProcess } from "node:child_process";
import { log } from "../../utils/logger.js";

export const WHISPER_PORT = 8178;
const WHISPER_HOST = "127.0.0.1";
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const KILL_GRACE_MS = 2000;

let child: ChildProcess | null = null;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

function clearInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

function startInactivityTimer(): void {
  clearInactivityTimer();
  inactivityTimer = setTimeout(() => {
    log({
      timestamp: new Date().toISOString(),
      event: "whisper_inactivity_timeout",
    });
    stopWhisperServer();
  }, INACTIVITY_TIMEOUT_MS);
}

export function startWhisperServer(binPath: string, modelPath: string): void {
  if (child) {
    return;
  }

  child = spawn(binPath, [
    "--model",
    modelPath,
    "--port",
    String(WHISPER_PORT),
    "--host",
    WHISPER_HOST,
  ]);

  child.on("exit", (code) => {
    log({
      timestamp: new Date().toISOString(),
      event: "whisper_server_exited",
      code,
    });
    child = null;
    clearInactivityTimer();
  });

  log({
    timestamp: new Date().toISOString(),
    event: "whisper_server_started",
    pid: child.pid,
  });
  startInactivityTimer();
}

export function stopWhisperServer(): void {
  if (!child) {
    return;
  }

  const ref = child;
  child = null;
  clearInactivityTimer();

  ref.kill("SIGTERM");
  const timeout = setTimeout(() => {
    if (!ref.killed) {
      ref.kill("SIGKILL");
    }
  }, KILL_GRACE_MS);
  ref.on("exit", () => clearTimeout(timeout));
}

export async function isWhisperServerRunning(): Promise<boolean> {
  if (!child) {
    return false;
  }
  try {
    const res = await fetch(`http://${WHISPER_HOST}:${WHISPER_PORT}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export function touchWhisperActivity(): void {
  if (child) {
    startInactivityTimer();
  }
}
