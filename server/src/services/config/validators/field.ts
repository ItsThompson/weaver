import {
  VALID_OPEN_DISPLAY_OPTIONS,
  VALID_CLOSE_DISPLAY_OPTIONS,
  DEFAULT_CONFIG,
} from "@weaver/shared/types";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

export type ValidatorResult = { value?: unknown; warning?: string };
export type FieldValidator = (value: unknown) => ValidatorResult;

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

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateSkillGraph(value: unknown): ValidatorResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { warning: "skill_graph must be an object" };
  }

  const obj = value as Record<string, unknown>;
  if (obj.categories === undefined) {
    return { value: { categories: {} } };
  }

  if (
    typeof obj.categories !== "object" ||
    obj.categories === null ||
    Array.isArray(obj.categories)
  ) {
    return { warning: "skill_graph.categories must be an object" };
  }

  const categories = obj.categories as Record<string, unknown>;

  const result = Object.entries(categories).reduce<{
    warning?: string;
    seen: Set<string>;
  }>(
    (acc, [key, entry]) => {
      if (acc.warning) {
        return acc;
      }

      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return {
          ...acc,
          warning: `skill_graph.categories.${key} must be an object`,
        };
      }

      const cat = entry as Record<string, unknown>;

      if (
        cat.color !== undefined &&
        (typeof cat.color !== "string" || !HEX_COLOR.test(cat.color))
      ) {
        return {
          ...acc,
          warning: `skill_graph.categories.${key}.color must be a hex string (e.g. #ff6b6b)`,
        };
      }

      if (
        !Array.isArray(cat.skills) ||
        !cat.skills.every((s: unknown) => typeof s === "string")
      ) {
        return {
          ...acc,
          warning: `skill_graph.categories.${key}.skills must be an array of strings`,
        };
      }

      const duplicate = (cat.skills as string[]).find((skill) =>
        acc.seen.has(skill),
      );
      if (duplicate) {
        return {
          ...acc,
          warning: `skill "${duplicate}" is assigned to multiple categories`,
        };
      }

      (cat.skills as string[]).forEach((skill) => acc.seen.add(skill));
      return acc;
    },
    { seen: new Set<string>() },
  );

  if (result.warning) {
    return { warning: result.warning };
  }

  return {
    value: {
      categories: categories as Record<string, SkillGraphCategoryConfig>,
    },
  };
}

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

export function validateSkillPaths(value: unknown): ValidatorResult {
  if (!Array.isArray(value)) {
    return { warning: "skill_paths must be an array of strings" };
  }
  if (!value.every((entry: unknown) => typeof entry === "string")) {
    return { warning: "skill_paths must contain only strings" };
  }

  const { trimmed, removed } = (value as string[]).reduce(
    (acc, entry) => {
      const cleaned = entry.trim();
      if (cleaned.length > 0) {
        acc.trimmed.push(cleaned);
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
      warning: `skill_paths: removed ${removed} empty or whitespace-only entries`,
    };
  }
  return { value: trimmed };
}

function validateNonEmptyString(
  obj: Record<string, unknown>,
  key: string,
  prefix: string,
): string | undefined {
  if (obj[key] === undefined) {
    return undefined;
  }
  if (typeof obj[key] !== "string" || (obj[key] as string).trim() === "") {
    return `${prefix}.${key} must be a non-empty string`;
  }
  return undefined;
}

export function validateDictation(value: unknown): ValidatorResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { warning: "dictation must be an object" };
  }

  const obj = value as Record<string, unknown>;

  for (const key of ["ollama_url", "ollama_model"] as const) {
    const warning = validateNonEmptyString(obj, key, "dictation");
    if (warning) {
      return { warning };
    }
  }

  if ("llm_cleanup" in obj && typeof obj.llm_cleanup !== "boolean") {
    return { warning: "dictation.llm_cleanup must be a boolean" };
  }

  if (
    "microphone_device_id" in obj &&
    typeof obj.microphone_device_id !== "string"
  ) {
    return { warning: "dictation.microphone_device_id must be a string" };
  }

  return {
    value: {
      ...DEFAULT_CONFIG.dictation,
      ...("ollama_url" in obj && { ollama_url: obj.ollama_url }),
      ...("ollama_model" in obj && { ollama_model: obj.ollama_model }),
      ...("llm_cleanup" in obj && { llm_cleanup: obj.llm_cleanup }),
      ...("microphone_device_id" in obj && {
        microphone_device_id: obj.microphone_device_id,
      }),
    },
  };
}

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
  skill_graph: validateSkillGraph,
  skill_paths: validateSkillPaths,
  dictation: validateDictation,
};
