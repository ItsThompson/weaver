import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  WeaverProjectConfig,
  StopValidationHook,
  PostToolValidationHook,
} from "@weaver/shared/types";
import { DEFAULT_TEST_RUNNERS } from "@weaver/shared/types";

function hasShape<T extends Record<string, string>>(
  value: unknown,
  requiredKeys: (keyof T)[],
): value is T {
  if (typeof value !== "object" || value === null) return false;
  return requiredKeys.every((key) => typeof (value as any)[key] === "string");
}

function isValidStopHook(hook: unknown): hook is StopValidationHook {
  return hasShape(hook, ["name", "command"]);
}

function isValidPostToolHook(hook: unknown): hook is PostToolValidationHook {
  return hasShape(hook, ["name", "command", "matcher"]);
}

export function readProjectConfig(cwd: string): WeaverProjectConfig | null {
  const configPath = join(cwd, ".weaver");
  if (!existsSync(configPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("weaver: invalid JSON in .weaver config");
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.error("weaver: .weaver config must be a JSON object");
    return null;
  }

  const config = parsed as Record<string, unknown>;
  const result: WeaverProjectConfig = {};

  if (config.validation === undefined) return result;

  if (typeof config.validation !== "object" || config.validation === null) {
    console.error("weaver: .weaver validation must be an object");
    return result;
  }

  const v = config.validation as Record<string, unknown>;
  result.validation = {};

  if (Array.isArray(v.test_runners)) {
    result.validation.test_runners = v.test_runners.filter(
      (r: unknown) => typeof r === "string",
    );
  }

  if (v.stop !== undefined) {
    if (!Array.isArray(v.stop)) {
      console.error("weaver: .weaver validation.stop must be an array");
    } else {
      const valid = v.stop.filter((h) => {
        if (!isValidStopHook(h)) {
          console.error(
            `weaver: invalid stop hook (missing name or command), skipping`,
          );
          return false;
        }
        return true;
      });
      result.validation.stop = valid;
    }
  }

  if (v.postToolUse !== undefined) {
    if (!Array.isArray(v.postToolUse)) {
      console.error("weaver: .weaver validation.postToolUse must be an array");
    } else {
      const valid = v.postToolUse.filter((h) => {
        if (!isValidPostToolHook(h)) {
          console.error(
            `weaver: invalid postToolUse hook (missing name, command, or matcher), skipping`,
          );
          return false;
        }
        return true;
      });
      result.validation.postToolUse = valid;
    }
  }

  return result;
}

/**
 * Merge test runners from global ~/.weaver/config.json and per-project .weaver config.
 * Falls back to DEFAULT_TEST_RUNNERS when neither defines any.
 */
export function resolveTestRunners(
  projectConfig: WeaverProjectConfig | null,
): string[] {
  const globalRunners = readGlobalTestRunners();
  const projectRunners = projectConfig?.validation?.test_runners;

  if (!globalRunners.length && !projectRunners?.length)
    return DEFAULT_TEST_RUNNERS;

  const merged = new Set<string>(
    globalRunners.length ? globalRunners : DEFAULT_TEST_RUNNERS,
  );
  if (projectRunners) for (const r of projectRunners) merged.add(r);
  return [...merged];
}

function readGlobalTestRunners(): string[] {
  const configPath = join(homedir(), ".weaver", "config.json");
  if (!existsSync(configPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    if (Array.isArray(parsed?.test_runners))
      return parsed.test_runners.filter((r: unknown) => typeof r === "string");
  } catch {
    /* ignore */
  }
  return [];
}
