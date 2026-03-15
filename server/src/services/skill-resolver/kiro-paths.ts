import { join } from "node:path";
import { homedir } from "node:os";

/** Returns workspace and global `.kiro` paths for the given sub-path segments. */
export function kiroSearchPaths(cwd: string, ...segments: string[]): string[] {
  return [
    join(cwd, ".kiro", ...segments),
    join(homedir(), ".kiro", ...segments),
  ];
}
