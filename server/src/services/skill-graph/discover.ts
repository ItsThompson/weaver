import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { FileCache } from "../file-cache/file-cache";
import { parseSkillFile } from "./parse-skill";
import { log } from "../../utils/logger";
import { buildSearchDirs } from "./search-dirs";
import type { ParsedSkill, SkillEntry } from "./types";

const skillCache = new FileCache<ParsedSkill>();

export { skillCache };

export interface DiscoverResult {
  entries: SkillEntry[];
  configCategories: Record<string, SkillGraphCategoryConfig>;
}

export async function discoverSkills(): Promise<DiscoverResult> {
  const { dirs: searchDirs, configCategories } = await buildSearchDirs();

  const pathResults = await Promise.all(
    searchDirs.map(async ({ dirPath, source, project }) => {
      const names = await listSkillDirNames(dirPath);
      return Promise.all(
        names.map(async (name): Promise<SkillEntry[]> => {
          const skillPath = join(dirPath, name, "SKILL.md");
          try {
            const parsed = await skillCache.get(skillPath, async () => {
              const content = await readFile(skillPath, "utf-8");
              return parseSkillFile(content);
            });
            return [{ name, source, project, parsed }];
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

  return { entries: pathResults.flat(2), configCategories };
}
