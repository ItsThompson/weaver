export { isPlainObject, readFile } from "../utils/fs";

/** Parses a JSON string. Returns null and logs to stderr on parse failure. */
export function parseJson(raw: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(raw) };
  } catch {
    console.error("weaver: invalid JSON in .weaver.json config");
    return null;
  }
}
