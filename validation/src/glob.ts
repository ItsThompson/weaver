import { extname } from "node:path";

/**
 * v1 extension-based glob matching only.
 * Supports patterns like `**\/*.{ts,tsx}` or `**\/*.py`.
 * Does NOT support full glob (directory patterns, negation, etc.).
 */
export function matchesExtensionGlob(
  files: string[],
  pattern: string,
): string[] {
  const braceMatch = pattern.match(/\.\{([^}]+)\}$/);
  if (braceMatch) {
    const exts = new Set(braceMatch[1].split(",").map((e) => "." + e.trim()));
    return files.filter((f) => exts.has(extname(f)));
  }
  const singleMatch = pattern.match(/\*(\.[a-zA-Z0-9]+)$/);
  if (singleMatch) {
    return files.filter((f) => extname(f) === singleMatch[1]);
  }
  return files; // unrecognized pattern → don't filter
}
