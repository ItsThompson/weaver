import { join, resolve } from "node:path";
import { listSkillDirNames } from "./list-skill-dirs";
import { expandHome } from "@weaver/shared/paths";

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
