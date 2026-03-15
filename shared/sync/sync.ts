import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readProjectConfig } from "./project-config";
import {
  calculateStopTimeout,
  calculatePostToolUseTimeout,
} from "./timeout-calc";
import { isPlainObject } from "./parsing";

const WEAVER_LOG = "weaver-log.sh";

export interface SyncOptions {
  dryRun?: boolean;
}

export interface SyncResult {
  patched: string[];
  skipped: string[];
  errors: string[];
}

export function syncAgentTimeouts(
  cwd: string,
  options?: SyncOptions,
): SyncResult {
  const result: SyncResult = { patched: [], skipped: [], errors: [] };

  const config = readProjectConfig(cwd);
  if (!config?.validation) {
    return result;
  }

  const stopTimeout = config.validation.stop?.length
    ? calculateStopTimeout(config.validation.stop)
    : null;
  const postToolUseTimeout = config.validation.postToolUse?.length
    ? calculatePostToolUseTimeout(config.validation.postToolUse)
    : null;

  if (!stopTimeout && !postToolUseTimeout) {
    return result;
  }

  const agentDirs = [
    join(cwd, ".kiro", "agents"),
    join(homedir(), ".kiro", "agents"),
  ];

  agentDirs.forEach((dir) => {
    if (!existsSync(dir)) {
      return;
    }

    readdirSync(dir).reduce<void>((_, file) => {
      if (!file.endsWith(".json")) {
        return;
      }
      patchAgentConfig(
        join(dir, file),
        stopTimeout,
        postToolUseTimeout,
        result,
        options?.dryRun ?? false,
      );
    }, undefined);
  });

  return result;
}

function patchAgentConfig(
  filePath: string,
  stopTimeout: number | null,
  postToolUseTimeout: number | null,
  result: SyncResult,
  dryRun: boolean,
): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (error) {
    result.errors.push(`${filePath}: ${String(error)}`);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    result.errors.push(`${filePath}: invalid JSON`);
    return;
  }

  if (!isPlainObject(parsed) || !isPlainObject(parsed.hooks)) {
    return;
  }

  let changed = false;

  if (stopTimeout && Array.isArray(parsed.hooks.stop)) {
    parsed.hooks.stop.forEach((entry: unknown) => {
      if (!isWeaverHook(entry)) {
        return;
      }
      if (entry.timeout_ms === stopTimeout) {
        return;
      }
      entry.timeout_ms = stopTimeout;
      changed = true;
    });
  }

  if (postToolUseTimeout && Array.isArray(parsed.hooks.postToolUse)) {
    parsed.hooks.postToolUse.forEach((entry: unknown) => {
      if (!isWeaverHook(entry)) {
        return;
      }
      if (entry.timeout_ms === postToolUseTimeout) {
        return;
      }
      entry.timeout_ms = postToolUseTimeout;
      changed = true;
    });
  }

  if (!changed) {
    result.skipped.push(filePath);
    return;
  }

  result.patched.push(filePath);

  if (!dryRun) {
    try {
      writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n");
    } catch (error) {
      result.errors.push(`${filePath}: write failed: ${String(error)}`);
    }
  }
}

function isWeaverHook(
  entry: unknown,
): entry is Record<string, unknown> & { timeout_ms?: number } {
  return (
    isPlainObject(entry) &&
    typeof entry.command === "string" &&
    entry.command.includes(WEAVER_LOG)
  );
}
