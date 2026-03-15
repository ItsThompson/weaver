import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

export async function listSkillDirNames(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.reduce<string[]>((names, entry) => {
      if (
        entry.isDirectory() &&
        existsSync(join(dirPath, entry.name, "SKILL.md"))
      ) {
        names.push(entry.name);
      }
      return names;
    }, []);
  } catch {
    return [];
  }
}
