import { basename, dirname } from "node:path";

export function skillNameFromPath(skillMdPath: string): string {
  return basename(dirname(skillMdPath));
}
