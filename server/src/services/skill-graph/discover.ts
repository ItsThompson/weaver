import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { FileCache } from "../file-cache/file-cache";
import { parseSkillFile } from "./parse-skill";
import { log } from "../../utils/logger";
import type { ParsedSkill, SkillEntry } from "./types";

const skillCache = new FileCache<ParsedSkill>();

export { skillCache };

export async function discoverSkills(cwd: string): Promise<SkillEntry[]> {
  const searchPaths = kiroSearchPaths(cwd, "skills");

  const pathResults = await Promise.all(
    searchPaths.map(async (dirPath, index) => {
      const source: "workspace" | "global" =
        index === 0 ? "workspace" : "global";
      const names = await listSkillDirNames(dirPath);

      return Promise.all(
        names.map(async (name): Promise<SkillEntry[]> => {
          const skillPath = join(dirPath, name, "SKILL.md");
          try {
            const parsed = await skillCache.get(skillPath, async () => {
              const content = await readFile(skillPath, "utf-8");
              return parseSkillFile(content);
            });
            return [{ name, source, parsed }];
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

  const seen = new Set<string>();
  return pathResults.flat(2).reduce<SkillEntry[]>((acc, entry) => {
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      acc.push(entry);
    }
    return acc;
  }, []);
}
