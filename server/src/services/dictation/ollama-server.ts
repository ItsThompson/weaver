import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { log } from "../../utils/logger";
import { checkOllamaHealth } from "./ollama-client";

const KNOWN_PATHS = [
  "/opt/homebrew/bin/ollama",
  "/usr/local/bin/ollama",
  "/usr/bin/ollama",
];

let child: ChildProcess | null = null;
let weStartedIt = false;

function findOllamaBin(): string | null {
  try {
    return execSync("which ollama", { encoding: "utf8" }).trim();
  } catch {
    // which failed, try known paths
  }
  return KNOWN_PATHS.find((path) => existsSync(path)) ?? null;
}

export async function ensureOllamaRunning(url: string): Promise<boolean> {
  if (await checkOllamaHealth(url)) {
    return true;
  }

  if (child) {
    return false;
  }

  const bin = findOllamaBin();
  if (!bin) {
    log({
      timestamp: new Date().toISOString(),
      event: "ollama_not_found",
      message: "ollama binary not found on system",
    });
    return false;
  }

  child = spawn(bin, ["serve"], {
    stdio: "ignore",
    detached: false,
    env: { ...process.env, OLLAMA_NUM_PARALLEL: "4" },
  });
  weStartedIt = true;

  child.on("exit", (code, signal) => {
    log({
      timestamp: new Date().toISOString(),
      event: "ollama_server_exited",
      code,
      signal,
    });
    child = null;
    weStartedIt = false;
  });

  log({
    timestamp: new Date().toISOString(),
    event: "ollama_server_started",
    pid: child.pid,
    bin,
  });

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!child) {
      return false;
    }
    if (await checkOllamaHealth(url)) {
      return true;
    }
  }

  return false;
}

export function stopOllamaServer(): void {
  if (!child || !weStartedIt) {
    return;
  }

  const ref = child;
  child = null;
  weStartedIt = false;

  ref.kill("SIGTERM");
  const timeout = setTimeout(() => {
    if (!ref.killed) {
      ref.kill("SIGKILL");
    }
  }, 2000);
  ref.on("exit", () => clearTimeout(timeout));
}
