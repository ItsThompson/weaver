import { basename, dirname } from "node:path";

/** Extracts the skill name from a SKILL.md path by returning the parent directory name. */
export function skillNameFromPath(skillMdPath: string): string {
  return basename(dirname(skillMdPath));
}
