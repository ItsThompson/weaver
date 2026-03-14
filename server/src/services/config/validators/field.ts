import type { ValidatorResult } from "./types";

export function validatePageSize(value: unknown): ValidatorResult {
  if (typeof value !== "number" || ![10, 25, 50].includes(value)) {
    return { warning: "page_size must be 10, 25, or 50" };
  }
  return { value };
}

export function validateGhostOpacity(value: unknown): ValidatorResult {
  if (typeof value !== "number" || value < 0 || value > 1) {
    return { warning: "ghost_opacity must be a number between 0 and 1" };
  }
  return { value };
}

export function validateWebhookUrl(value: unknown): ValidatorResult {
  if (typeof value !== "string") {
    return { warning: "webhook_url must be a string" };
  }
  if (
    value !== "" &&
    !value.startsWith("http://") &&
    !value.startsWith("https://")
  ) {
    return { warning: "webhook_url must start with http:// or https://" };
  }
  return { value };
}

export function validateWebhookFormat(value: unknown): ValidatorResult {
  if (value !== "simple" && value !== "advanced") {
    return { warning: 'webhook_format must be "simple" or "advanced"' };
  }
  return { value };
}

export function validateTestRunners(value: unknown): ValidatorResult {
  if (!Array.isArray(value)) {
    return { warning: "test_runners must be an array of strings" };
  }
  if (!value.every((r: unknown) => typeof r === "string")) {
    return { warning: "test_runners must contain only strings" };
  }

  const { trimmed, removed } = (value as string[]).reduce(
    (acc, runner) => {
      const t = runner.trim();
      if (t.length > 0) {
        acc.trimmed.push(t);
      } else {
        acc.removed++;
      }
      return acc;
    },
    { trimmed: [] as string[], removed: 0 },
  );

  if (removed > 0) {
    return {
      value: trimmed,
      warning: `test_runners: removed ${removed} empty or whitespace-only entries`,
    };
  }
  return { value: trimmed };
}
