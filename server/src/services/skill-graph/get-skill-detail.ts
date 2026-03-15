import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SkillDetail } from "@weaver/shared/types";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { parseSkillFile } from "./parse-skill";
import { log } from "../../utils/logger";
import { skillCache } from "./discover";

const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function getSkillDetail(
  skillName: string,
  cwd: string,
): Promise<SkillDetail | null> {
  if (!VALID_SKILL_NAME.test(skillName)) {
    return null;
  }

  const searchPaths = kiroSearchPaths(cwd, "skills");

  return searchPaths.reduce<Promise<SkillDetail | null>>(
    async (accPromise, dirPath) => {
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
        return await skillCache.get(skillPath, async () => {
          const content = await readFile(skillPath, "utf-8");
          return parseSkillFile(content);
        });
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
