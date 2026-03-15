import { readFileSync, writeFileSync } from "node:fs";
import { isPlainObject } from "../utils/fs";
import { WEAVER_LOG_HOOK } from "../types/validation";
import type { SyncResult, TimeoutPatch } from "./types";

/** Type guard: returns true if the hook entry has a command containing `weaver-log.sh`. */
function isWeaverHook(
  entry: unknown,
): entry is Record<string, unknown> & { timeout_ms?: number } {
  return (
    isPlainObject(entry) &&
    typeof entry.command === "string" &&
    entry.command.includes(WEAVER_LOG_HOOK)
  );
}

/**
 * Applies timeout patches to hook arrays in-memory. Returns true if any
 * value was changed.
 */
function applyPatches(
  hooks: Record<string, unknown>,
  patches: TimeoutPatch[],
): boolean {
  return patches.reduce((changed, { hookKey, timeout }) => {
    if (!Array.isArray(hooks[hookKey])) {
      return changed;
    }

    return (hooks[hookKey] as unknown[]).reduce<boolean>((acc, entry) => {
      if (!isWeaverHook(entry) || entry.timeout_ms === timeout) {
        return acc;
      }
      entry.timeout_ms = timeout;
      return true;
    }, changed);
  }, false);
}

/**
 * Reads a single agent config file, patches `timeout_ms` on weaver-log.sh
 * hook entries, and writes back if values changed. Populates `result` with
 * patched/skipped/error status.
 */
export function patchAgentConfig(
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

  const patches: TimeoutPatch[] = [
    ...(stopTimeout ? [{ hookKey: "stop", timeout: stopTimeout }] : []),
    ...(postToolUseTimeout
      ? [{ hookKey: "postToolUse", timeout: postToolUseTimeout }]
      : []),
  ];

  const changed = applyPatches(parsed.hooks, patches);

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
