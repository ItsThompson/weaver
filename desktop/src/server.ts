import { fork, execSync, ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import http from "node:http";
import { app } from "electron";
import { log } from "./utils/logger";
import { createLogger } from "@weaver/shared/logger";

export const SERVER_PORT = 8143;
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const isPacked = app.isPackaged;
const resourcesPath = isPacked
  ? resolve(process.resourcesPath, "server")
  : resolve(__dirname, "../../server");

let child: ChildProcess | null = null;

export function killPortOccupant(): void {
  try {
    const pid = execSync(`lsof -ti tcp:${SERVER_PORT}`, {
      encoding: "utf8",
    }).trim();
    if (pid) {
      process.kill(Number(pid), "SIGKILL");
      log({
        timestamp: new Date().toISOString(),
        event: "killed_orphaned_process",
        pid: Number(pid),
        port: SERVER_PORT,
      });
    }
  } catch {
    // No process on port — nothing to clean up
  }
}

export function start(): void {
  const serverEntry = resolve(resourcesPath, "dist/index.mjs");
  const env = { ...process.env };
  env.WEAVER_WHISPER_BIN = isPacked
    ? resolve(process.resourcesPath, "whisper-server")
    : resolve(__dirname, "../resources/whisper-server");
  if (isPacked) {
    env.WEAVER_CLIENT_DIST = resolve(process.resourcesPath, "client/dist");
  }
  child = fork(serverEntry, [], { stdio: "pipe", env });
  pipeChildStream(child, "stdout");
  pipeChildStream(child, "stderr");
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      log({
        timestamp: new Date().toISOString(),
        event: "server_exited",
        code,
      });
    }
  });
}

export function stop(): void {
  if (!child) {
    return;
  }
  const ref = child;
  child = null;
  ref.kill("SIGTERM");
  const timeout = setTimeout(() => {
    if (ref.exitCode === null && ref.signalCode === null) {
      ref.kill("SIGKILL");
    }
  }, 2000);
  ref.on("exit", () => clearTimeout(timeout));
}

function pipeChildStream(
  proc: ChildProcess,
  stream: "stdout" | "stderr",
): void {
  const readable = proc[stream];
  if (!readable) {
    return;
  }

  const childLog = createLogger(`server:${stream}`);
  createInterface({ input: readable }).on("line", (line) => {
    try {
      const parsed = JSON.parse(line);
      childLog({ ...parsed, source: undefined });
    } catch {
      childLog({
        timestamp: new Date().toISOString(),
        event: "server_raw_output",
        message: line,
      });
    }
  });
}

export function waitForReady(retries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      http
        .get(`${SERVER_URL}/api/health`, (res) => {
          if (res.statusCode === 200) {
            return resolve();
          }
          retry(remaining);
        })
        .on("error", () => retry(remaining));
    };

    const retry = (remaining: number) => {
      if (remaining <= 0) {
        return reject(new Error("Server failed to start"));
      }
      setTimeout(() => attempt(remaining - 1), 200);
    };

    attempt(retries);
  });
}
