import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WeaverProjectConfig } from "@weaver/shared/types";
import type { z } from "zod";
import { stopHookSchema, postToolHookSchema } from "./schemas";
import { filterValid } from "./validation";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFile(configPath: string): string | null {
  if (!existsSync(configPath)) return null;
  try {
    return readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }
}

function parseJson(raw: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    console.error("weaver: invalid JSON in .weaver config");
    return null;
  }
}

function parseValidationArray<T>(
  v: Record<string, unknown>,
  key: string,
  schema: z.ZodType<T>,
  label: string,
): T[] | undefined {
  if (v[key] === undefined) return undefined;
  if (!Array.isArray(v[key])) {
    console.error(`weaver: .weaver validation.${key} must be an array`);
    return undefined;
  }
  return filterValid(v[key], schema, label);
}

export function readProjectConfig(cwd: string): WeaverProjectConfig | null {
  const raw = readFile(join(cwd, ".weaver"));
  if (raw === null) return null;

  const result = parseJson(raw);
  if (result === null) return null;

  const parsed = result.value;
  if (!isPlainObject(parsed)) {
    console.error("weaver: .weaver config must be a JSON object");
    return null;
  }

  if (parsed.validation === undefined) return {};

  if (!isPlainObject(parsed.validation)) {
    console.error("weaver: .weaver validation must be an object");
    return {};
  }

  const validation = parsed.validation;

  return {
    validation: {
      test_runners: Array.isArray(validation.test_runners)
        ? validation.test_runners.filter((r: unknown) => typeof r === "string")
        : undefined,
      stop: parseValidationArray(
        validation,
        "stop",
        stopHookSchema,
        "stop hook (missing name or command)",
      ),
      postToolUse: parseValidationArray(
        validation,
        "postToolUse",
        postToolHookSchema,
        "postToolUse hook (missing name, command, or matcher)",
      ),
    },
  };
}
