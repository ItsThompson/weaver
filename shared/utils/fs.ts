import { readFileSync, existsSync } from "node:fs";

/** Type guard for plain objects (not arrays, not null). */
export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a file as UTF-8. Returns null if the file doesn't exist or can't be read. */
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
