import { join } from "node:path";
import { homedir } from "node:os";

export function kiroSearchPaths(cwd: string, ...segments: string[]): string[] {
  return [
    join(cwd, ".kiro", ...segments),
    join(homedir(), ".kiro", ...segments),
  ];
}
