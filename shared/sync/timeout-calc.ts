import {
  DEFAULT_STOP_TIMEOUT_MS,
  DEFAULT_POST_TOOL_TIMEOUT_MS,
  TIMEOUT_BUFFER_MS,
} from "../types/validation";
import type {
  StopValidationHook,
  PostToolValidationHook,
} from "../types/validation";

export function calculateStopTimeout(hooks: StopValidationHook[]): number {
  const sum = hooks.reduce(
    (total, hook) => total + (hook.timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS),
    0,
  );
  return sum + TIMEOUT_BUFFER_MS;
}

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
