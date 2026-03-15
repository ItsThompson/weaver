import {
  DEFAULT_STOP_TIMEOUT_MS,
  DEFAULT_POST_TOOL_TIMEOUT_MS,
  TIMEOUT_BUFFER_MS,
} from "../types/validation";
import type {
  StopValidationHook,
  PostToolValidationHook,
} from "../types/validation";

/**
 * Sums all stop hook timeouts (using defaults where omitted) and adds a
 * buffer. All stop hooks run sequentially in a single invocation.
 */
export function calculateStopTimeout(hooks: StopValidationHook[]): number {
  const sum = hooks.reduce(
    (total, hook) => total + (hook.timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS),
    0,
  );
  return sum + TIMEOUT_BUFFER_MS;
}

/**
 * Groups postToolUse hooks by matcher, sums each group's timeouts, and
 * returns the max group sum plus a buffer. Only hooks matching a specific
 * tool name run per invocation, so the worst case is the largest group.
 */
export function calculatePostToolUseTimeout(
  hooks: PostToolValidationHook[],
): number {
  const groups = hooks.reduce((acc, hook) => {
    const current = acc.get(hook.matcher) ?? 0;
    acc.set(
      hook.matcher,
      current + (hook.timeout_ms ?? DEFAULT_POST_TOOL_TIMEOUT_MS),
    );
    return acc;
  }, new Map<string, number>());

  const max = groups.size > 0 ? Math.max(...groups.values()) : 0;
  return max + TIMEOUT_BUFFER_MS;
}
