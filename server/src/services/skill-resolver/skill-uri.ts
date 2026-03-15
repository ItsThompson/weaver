import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { listSkillDirNames } from "./list-skill-dirs";

export function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

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
