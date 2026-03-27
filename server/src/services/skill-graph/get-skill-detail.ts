import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  SkillDetail,
  SkillGraphCategoryConfig,
} from "@weaver/shared/types";
import { parseSkillFile } from "./parse-skill";
import { categorizeSkill } from "./category";
import { log } from "../../utils/logger";
import { globalSkillsPath, expandHome } from "@weaver/shared/paths";
import { skillCache } from "./discover";
import { deriveProject } from "./discover";
import { isEnoent } from "./utils";
import { VALID_SKILL_NAME } from "./constants";

interface CandidatePath {
  dirPath: string;
  source: "workspace" | "global";
  project: string | null;
}

export async function getSkillDetail(
  skillName: string,
  skillPaths: string[],
  configCategories: Record<string, SkillGraphCategoryConfig> = {},
  project?: string,
  source?: string,
): Promise<SkillDetail | null> {
  if (!VALID_SKILL_NAME.test(skillName)) {
    return null;
  }

  const candidates: CandidatePath[] = [
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
      project: null,
    },
  ];

  const filtered = candidates.filter((candidate) => {
    if (source === "global") {
      return candidate.project === null;
    }
    if (project) {
      return candidate.project === project;
    }
    return true;
  });

  for (const candidate of filtered) {
    const skillPath = join(candidate.dirPath, skillName, "SKILL.md");
    const resolved = resolve(skillPath);
    if (!resolved.startsWith(resolve(candidate.dirPath))) {
      continue;
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
      return {
        ...parsed,
        source: candidate.source,
        category,
        project: candidate.project,
      };
    } catch (error) {
      if (isEnoent(error)) {
        continue;
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
  }

  return null;
}
