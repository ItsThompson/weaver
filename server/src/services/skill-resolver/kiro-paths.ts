import { join } from "node:path";
import { globalKiroDir } from "@weaver/shared/paths";

/** Returns workspace and global `.kiro` paths for the given sub-path segments. */
export function kiroSearchPaths(cwd: string, ...segments: string[]): string[] {
  return [join(cwd, ".kiro", ...segments), join(globalKiroDir(), ...segments)];
}
