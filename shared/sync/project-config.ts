import { join } from "node:path";
import type { WeaverProjectConfig } from "../types/validation";
import { stopHookSchema, postToolHookSchema } from "./schemas";
import { parseValidationArray } from "./validation";
import { readFile, parseJson, isPlainObject } from "./parsing";

export function readProjectConfig(cwd: string): WeaverProjectConfig | null {
  const raw = readFile(join(cwd, ".weaver.json"));
  if (raw === null) {
    return null;
  }

  const result = parseJson(raw);
  if (result === null) {
    return null;
  }

  const parsed = result.value;
  if (!isPlainObject(parsed)) {
    console.error("weaver: .weaver.json config must be a JSON object");
    return null;
  }

  if (parsed.validation === undefined) {
    return {};
  }

  if (!isPlainObject(parsed.validation)) {
    console.error("weaver: .weaver.json validation must be an object");
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
