import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { isPlainObject } from "@weaver/shared/utils";
import { WEAVER_LOG_HOOK } from "@weaver/shared/types";
import type { SyncResult } from "@weaver/shared/sync";

// Sync fs operations are intentional: this module runs as a standalone script
// (sync-entry.mjs) at session start, not inside the long-lived server process.
// Async would add complexity with no benefit in this context.

/**
 * Minimum timeout in seconds for any hook entry.
 * Prevents zero or near-zero values from causing immediate timeouts.
 */
const MIN_TIMEOUT_SECONDS = 10;

/** Converts milliseconds to seconds, rounding up, with a minimum floor. */
export function msToSeconds(ms: number): number {
  return Math.max(Math.ceil(ms / 1000), MIN_TIMEOUT_SECONDS);
}

/** Returns true if an entry's command contains the Weaver hook script name. */
function isWeaverCommand(command: unknown): boolean {
  return typeof command === "string" && command.includes(WEAVER_LOG_HOOK);
}

/**
 * Builds the Claude Code hook configuration for a single event.
 * Claude Code hook format: array of matcher groups, each with a hooks array.
 */
function buildHookEntry(
  hookCommand: string,
  timeout: number,
  matcher?: string,
): Record<string, unknown> {
  const hookObj: Record<string, unknown> = {
    type: "command",
    command: hookCommand,
    timeout,
  };
  const entry: Record<string, unknown> = { hooks: [hookObj] };
  if (matcher) {
    entry.matcher = matcher;
  }
  return entry;
}

/**
 * Updates or inserts a Weaver hook entry within an event's hook array.
 * Returns true if any change was made.
 */
function upsertWeaverHook(
  eventHooks: unknown[],
  hookCommand: string,
  timeout: number,
  matcher?: string,
): boolean {
  // Find existing Weaver entry
  const existingIndex = eventHooks.findIndex((group) => {
    if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
      return false;
    }
    return (group.hooks as unknown[]).some(
      (hook) => isPlainObject(hook) && isWeaverCommand(hook.command),
    );
  });

  if (existingIndex !== -1) {
    const group = eventHooks[existingIndex] as Record<string, unknown>;
    const hooks = group.hooks as Record<string, unknown>[];
    const weaverHook = hooks.find((hook) => isWeaverCommand(hook.command));
    if (weaverHook) {
      if (weaverHook.command === hookCommand && weaverHook.timeout === timeout) {
        return false;
      }
      weaverHook.command = hookCommand;
      weaverHook.timeout = timeout;
      return true;
    }
  }

  // No existing entry: insert new one
  eventHooks.push(buildHookEntry(hookCommand, timeout, matcher));
  return true;
}

/**
 * Patches a `.claude/settings.json` file with Weaver hook entries.
 * Creates the file if it doesn't exist. Preserves all non-Weaver entries.
 */
export function patchSettings(
  filePath: string,
  hookCommand: string,
  stopTimeout: number | null,
  postToolUseTimeout: number | null,
  result: SyncResult,
  dryRun: boolean,
): void {
  let parsed: Record<string, unknown>;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const value = JSON.parse(raw);
    if (!isPlainObject(value)) {
      result.errors.push(`${filePath}: not a JSON object`);
      return;
    }
    parsed = value;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      result.errors.push(`${filePath}: invalid JSON`);
      return;
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      parsed = {};
    } else {
      result.errors.push(`${filePath}: ${String(error)}`);
      return;
    }
  }

  if (!isPlainObject(parsed.hooks)) {
    parsed.hooks = {};
  }
  const hooks = parsed.hooks as Record<string, unknown[]>;

  const defaultTimeout = MIN_TIMEOUT_SECONDS;
  const stopSec = stopTimeout != null ? msToSeconds(stopTimeout) : defaultTimeout;
  const postToolUseSec = postToolUseTimeout != null
    ? msToSeconds(postToolUseTimeout)
    : defaultTimeout;

  // Event entries to configure with their timeouts
  const entries: Array<{
    event: string;
    timeout: number;
    matcher?: string;
  }> = [
    { event: "SessionStart", timeout: defaultTimeout },
    { event: "UserPromptSubmit", timeout: defaultTimeout },
    { event: "PreToolUse", timeout: defaultTimeout, matcher: "*" },
    { event: "PostToolUse", timeout: postToolUseSec, matcher: "*" },
    { event: "Stop", timeout: stopSec },
    { event: "SessionEnd", timeout: defaultTimeout },
  ];

  let changed = false;

  entries.forEach(({ event, timeout, matcher }) => {
    if (!Array.isArray(hooks[event])) {
      hooks[event] = [];
    }
    if (upsertWeaverHook(hooks[event], hookCommand, timeout, matcher)) {
      changed = true;
    }
  });

  if (!changed) {
    result.skipped.push(filePath);
    return;
  }

  result.patched.push(filePath);

  if (!dryRun) {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      // Trailing newline for POSIX compliance and clean diffs
      writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n");
    } catch (error) {
      result.errors.push(`${filePath}: write failed: ${String(error)}`);
    }
  }
}
