import {
  VALID_OPEN_DISPLAY_OPTIONS,
  VALID_CLOSE_DISPLAY_OPTIONS,
} from "@weaver/shared/types";

export type ValidatorResult = { value?: unknown; warning?: string };
type FieldValidator = (value: unknown) => ValidatorResult;

// --- Factory validators ---

function validateBoolean(field: string): FieldValidator {
  return (value) => {
    if (typeof value !== "boolean") {
      return { warning: `${field} must be a boolean` };
    }
    return { value };
  };
}

function validateDisplayOptions(
  field: string,
  valid: readonly string[],
): FieldValidator {
  return (value) => {
    if (!Array.isArray(value)) {
      return { warning: `${field} must be an array of strings` };
    }
    if (!value.every((v) => typeof v === "string")) {
      return { warning: `${field} must contain only strings` };
    }

    const invalid = value.filter((v: string) => !valid.includes(v));
    if (invalid.length > 0) {
      return {
        warning: `${field} contains invalid options: ${invalid.join(", ")}`,
      };
    }
    return { value: value as string[] };
  };
}

// --- Specific validators ---

function validatePageSize(value: unknown): ValidatorResult {
  if (typeof value !== "number" || ![10, 25, 50].includes(value)) {
    return { warning: "page_size must be 10, 25, or 50" };
  }
  return { value };
}

function validateGhostOpacity(value: unknown): ValidatorResult {
  if (typeof value !== "number" || value < 0 || value > 1) {
    return { warning: "ghost_opacity must be a number between 0 and 1" };
  }
  return { value };
}

function validateWebhookUrl(value: unknown): ValidatorResult {
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

function validateWebhookFormat(value: unknown): ValidatorResult {
  if (value !== "simple" && value !== "advanced") {
    return { warning: 'webhook_format must be "simple" or "advanced"' };
  }
  return { value };
}

function validateTestRunners(value: unknown): ValidatorResult {
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

// --- Registry ---

export const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  enable_notification_sounds: validateBoolean("enable_notification_sounds"),
  dark_mode: validateBoolean("dark_mode"),
  ghost_mode: validateBoolean("ghost_mode"),
  ghost_opacity: validateGhostOpacity,
  page_size: validatePageSize,
  open_display_options: validateDisplayOptions(
    "open_display_options",
    VALID_OPEN_DISPLAY_OPTIONS,
  ),
  close_display_options: validateDisplayOptions(
    "close_display_options",
    VALID_CLOSE_DISPLAY_OPTIONS,
  ),
  webhook_url: validateWebhookUrl,
  webhook_format: validateWebhookFormat,
  test_runners: validateTestRunners,
};
