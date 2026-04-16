import { readFileSync, existsSync } from "node:fs";

export { isPlainObject } from "./is-plain-object";

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

/** Parses a JSON string. Returns null on parse failure. */
export function parseJson(raw: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return null;
  }
}
