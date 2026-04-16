import { readFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { FileCache } from "../file-cache/file-cache";
import { parseSkillFile } from "./parse-skill";
import { log } from "../../utils/logger";
import { expandHome } from "@weaver/shared/paths";
import type { ParsedSkill, SkillEntry } from "./types";

const skillCache = new FileCache<ParsedSkill>();

export { skillCache };

export function deriveProject(skillDirPath: string): string | null {
  const normalized = resolve(expandHome(skillDirPath));
  const suffix = `${join(".kiro", "skills")}`;
  if (normalized.endsWith(`/${suffix}`) || normalized.endsWith(`\\${suffix}`)) {
    const parent = normalized.slice(0, -(suffix.length + 1));
    return basename(parent);
  }
  return basename(normalized);
}

/**
 * Discovers skills from the provided paths. Each path entry includes the
 * directory path and its source ("workspace" or "global"). The caller is
 * responsible for providing all paths (including global) via the adapter.
 */
export async function discoverSkills(
  skillPaths: Array<{ path: string; source: "workspace" | "global" }>,
): Promise<SkillEntry[]> {
  const pathResults = await Promise.all(
    skillPaths.map(async ({ path: dirPath, source }) => {
      const expanded = resolve(expandHome(dirPath));
      const project = source === "global" ? null : deriveProject(dirPath);
      const names = await listSkillDirNames(expanded);

      return Promise.all(
        names.map(async (name): Promise<SkillEntry[]> => {
          const skillPath = join(expanded, name, "SKILL.md");
          try {
            const parsed = await skillCache.get(skillPath, async () => {
              const content = await readFile(skillPath, "utf-8");
              return parseSkillFile(content);
            });
            return [{ name, source, parsed, project }];
          } catch (error) {
            log({
              timestamp: new Date().toISOString(),
              event: "skill_parse_error",
              skill: name,
              path: skillPath,
              error: String(error),
            });
            return [];
          }
        }),
      );
    }),
  );

  return pathResults.flat(2);
}
