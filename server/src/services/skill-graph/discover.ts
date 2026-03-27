import { readFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { FileCache } from "../file-cache/file-cache";
import { parseSkillFile } from "./parse-skill";
import { log } from "../../utils/logger";
import { globalSkillsPath, expandHome } from "@weaver/shared/paths";
import type { ParsedSkill, SkillEntry } from "./types";

const skillCache = new FileCache<ParsedSkill>();

export { skillCache };

export function deriveProject(skillDirPath: string): string | null {
  const normalized = resolve(expandHome(skillDirPath));
  if (normalized === globalSkillsPath()) {
    return null;
  }
  const suffix = `${join(".kiro", "skills")}`;
  if (normalized.endsWith(`/${suffix}`) || normalized.endsWith(`\\${suffix}`)) {
    const parent = normalized.slice(0, -(suffix.length + 1));
    return basename(parent);
  }
  return basename(normalized);
}

export async function discoverSkills(
  skillPaths: string[],
): Promise<SkillEntry[]> {
  const allPaths = [
    ...skillPaths.map((dirPath) => {
      const expanded = resolve(expandHome(dirPath));
      return {
        dirPath: expanded,
        source: "workspace" as const,
        project: deriveProject(dirPath),
      };
    }),
    {
      dirPath: globalSkillsPath(),
      source: "global" as const,
      project: null as string | null,
    },
  ];

  const pathResults = await Promise.all(
    allPaths.map(async ({ dirPath, source, project }) => {
      const names = await listSkillDirNames(dirPath);

      return Promise.all(
        names.map(async (name): Promise<SkillEntry[]> => {
          const skillPath = join(dirPath, name, "SKILL.md");
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
