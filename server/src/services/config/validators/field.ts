import type { ValidatorResult } from "./types";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

  const resolved: string[] = [];
  const seen = new Set<string>();
  const fieldErrors: Record<string, string> = {};

  (value as string[]).forEach((entry, index) => {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      return;
    }
    if (seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    const expanded = trimmed.startsWith("~")
      ? join(homedir(), trimmed.slice(1))
      : trimmed;
    if (existsSync(expanded) && statSync(expanded).isDirectory()) {
      resolved.push(trimmed);
    } else {
      fieldErrors[String(index)] =
        `${expanded} does not exist or is not a directory`;
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { value: resolved, fieldErrors };
  }

  return { value: resolved };
}
