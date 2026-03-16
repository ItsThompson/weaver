import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  SkillDetail,
  SkillGraphCategoryConfig,
} from "@weaver/shared/types";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { parseSkillFile } from "./parse-skill";
import { categorizeSkill } from "./category";
import { log } from "../../utils/logger";
import { skillCache } from "./discover";
import { isEnoent } from "./utils";
import { VALID_SKILL_NAME } from "./constants";

export async function getSkillDetail(
  skillName: string,
  cwd: string,
  configCategories: Record<string, SkillGraphCategoryConfig> = {},
): Promise<SkillDetail | null> {
  if (!VALID_SKILL_NAME.test(skillName)) {
    return null;
  }

  const searchPaths = kiroSearchPaths(cwd, "skills");

  return searchPaths.reduce<Promise<SkillDetail | null>>(
    async (accPromise, dirPath, index) => {
      const acc = await accPromise;
      if (acc) {
        return acc;
      }

      const skillPath = join(dirPath, skillName, "SKILL.md");
      const resolved = resolve(skillPath);
      if (!resolved.startsWith(resolve(dirPath))) {
        return null;
      }

      const source: "workspace" | "global" =
        index === 0 ? "workspace" : "global";

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
        return { ...parsed, source, category };
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
