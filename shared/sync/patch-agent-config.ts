import { readFileSync, writeFileSync } from "node:fs";
import { isPlainObject } from "./parsing";
import { WEAVER_LOG_HOOK } from "../types/validation";
import type { SyncResult, TimeoutPatch } from "./types";

function isWeaverHook(
  entry: unknown,
): entry is Record<string, unknown> & { timeout_ms?: number } {
  return (
    isPlainObject(entry) &&
    typeof entry.command === "string" &&
    entry.command.includes(WEAVER_LOG_HOOK)
  );
}

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
