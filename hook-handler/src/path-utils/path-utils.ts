import { resolve, relative, isAbsolute } from "node:path";

export function isWithinDir(filePath: string, dir: string): boolean {
  const rel = relative(dir, resolve(filePath));
  return !rel.startsWith("..") && !isAbsolute(rel);
}
