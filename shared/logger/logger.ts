import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { appLogsDir } from "../paths/paths";

export interface LogEntry {
  timestamp: string;
  event: string;
  [key: string]: unknown;
}

export type LogFn = (entry: LogEntry) => void;

interface CreateLoggerOptions {
  /** Write to stderr instead of stdout for console output */
  stderr?: boolean;
}

let dirCreated = false;

function ensureDir(): void {
  if (dirCreated) {
    return;
  }
  mkdirSync(appLogsDir(), { recursive: true });
  dirCreated = true;
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(appLogsDir(), `${date}.log`);
}

export function createLogger(
  source: string,
  options?: CreateLoggerOptions,
): LogFn {
  const write = options?.stderr ? console.error : console.log;

  return (entry: LogEntry): void => {
    const line = JSON.stringify({ ...entry, source });
    write(line);
    try {
      ensureDir();
      appendFileSync(logFilePath(), line + "\n");
    } catch {
      // File write failed: console output is the fallback
    }
  };
}

const DATE_LOG_RE = /^\d{4}-\d{2}-\d{2}\.log$/;

export function pruneAppLogs(maxAgeDays = 30): void {
  const dir = appLogsDir();
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return; // Directory doesn't exist yet
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  files.forEach((file) => {
    if (!DATE_LOG_RE.test(file)) {
      return;
    }
    const fileDate = file.slice(0, 10);
    if (fileDate < cutoffStr) {
      try {
        unlinkSync(join(dir, file));
      } catch {
        // Best-effort cleanup
      }
    }
  });
}

/** Reset internal state (for testing only) */
export function _resetDirCreated(): void {
  dirCreated = false;
}
