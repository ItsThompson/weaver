import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SkillDetail } from "@weaver/shared/types";
import { parseSkillFile } from "./parse-skill";
import { categorizeSkill } from "./category";
import { log } from "../../utils/logger";
import { skillCache } from "./discover";
import { isEnoent } from "./utils";
import { VALID_SKILL_NAME } from "./constants";
import { buildSearchDirs } from "./search-dirs";

export async function getSkillDetail(
  skillName: string,
  options?: { project?: string; source?: string },
): Promise<SkillDetail | null> {
  if (!VALID_SKILL_NAME.test(skillName)) {
    return null;
  }

  const { dirs: searchDirs, configCategories } = await buildSearchDirs();

  const candidates =
    options?.source === "global"
      ? searchDirs.filter((dir) => dir.source === "global")
      : options?.project !== undefined
        ? searchDirs.filter((dir) => dir.project === options.project)
        : searchDirs;

  return candidates.reduce<Promise<SkillDetail | null>>(
    async (accPromise, { dirPath, source, project: dirProject }) => {
      const acc = await accPromise;
      if (acc) {
        return acc;
      }

      const skillPath = join(dirPath, skillName, "SKILL.md");
      const resolved = resolve(skillPath);
      if (!resolved.startsWith(resolve(dirPath))) {
        return null;
      }

      try {
        const parsed = await skillCache.get(skillPath, async () => {
          const content = await readFile(skillPath, "utf-8");
          return parseSkillFile(content);
        });
        const fm = parsed.frontmatter.category;
        const frontmatterCategory = typeof fm === "string" ? fm : undefined;
        const category = categorizeSkill(
          skillName,
          configCategories,
          frontmatterCategory,
        );
        return { ...parsed, source, category, project: dirProject };
      } catch (error) {
        if (isEnoent(error)) {
          return null;
        }
        log({
          timestamp: new Date().toISOString(),
          event: "skill_detail_error",
          skill: skillName,
          path: skillPath,
          error: String(error),
        });
        throw error;
      }
    },
    Promise.resolve(null),
  );
}
