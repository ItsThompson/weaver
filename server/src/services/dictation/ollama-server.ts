import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { weaverDir } from "@weaver/shared/paths";
import { createManagedProcess } from "../managed-process";
import { log } from "../../utils/logger";
import { checkOllamaHealth } from "./ollama-client";

const KNOWN_PATHS = [
  "/opt/homebrew/bin/ollama",
  "/usr/local/bin/ollama",
  "/usr/bin/ollama",
];

const managed = createManagedProcess({
  name: "ollama_server",
  cleanup: { type: "pidfile", path: join(weaverDir(), ".ollama-pid") },
});

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

  if (managed.isAlive()) {
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

  managed.start(bin, ["serve"], {
    stdio: "ignore",
    env: { ...process.env, OLLAMA_NUM_PARALLEL: "4" },
  });

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!managed.isAlive()) {
      return false;
    }
    if (await checkOllamaHealth(url)) {
      return true;
    }
  }

  return false;
}

export function stopOllamaServer(): void {
  managed.stop();
}
