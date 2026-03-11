import { readFileSync, existsSync } from "node:fs";

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readFile(configPath: string): string | null {
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    return readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }
}

export function parseJson(raw: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    console.error("weaver: invalid JSON in .weaver config");
    return null;
  }
}
