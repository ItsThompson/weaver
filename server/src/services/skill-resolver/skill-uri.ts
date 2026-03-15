import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { listSkillDirNames } from "./list-skill-dirs";

/** Expands a leading `~/` to the user's home directory. */
export function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Resolves a `skill://` URI to a list of skill directory names.
 * Handles home expansion (`~/`) and resolves relative paths against cwd.
 * Expects a glob pattern (e.g. star/SKILL.md) to identify the base directory.
 */
export async function resolveSkillUri(
  uri: string,
  cwd: string,
): Promise<string[]> {
  const rawPath = uri.slice("skill://".length);
  const expanded = expandHome(rawPath);

  const globIndex = expanded.indexOf("*/");
  if (globIndex === -1) {
    return [];
  }

  const rawBase = expanded.slice(0, globIndex);
  const baseDir = expanded.startsWith("/")
    ? rawBase.replace(/\/+$/, "")
    : resolve(cwd, rawBase);

  return listSkillDirNames(baseDir);
}
