import { join, basename, dirname } from "node:path";
import { homedir } from "node:os";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";
import { readConfig } from "../config/index";

export interface SearchDir {
  dirPath: string;
  source: "workspace" | "global";
  project: string | null;
}

export interface SearchDirsResult {
  dirs: SearchDir[];
  configCategories: Record<string, SkillGraphCategoryConfig>;
}

function deriveProject(expanded: string): string {
  const parent = dirname(expanded);
  if (basename(parent) === ".kiro") {
    const grandparent = basename(dirname(parent));
    if (grandparent) {
      return grandparent;
    }
  }
  return basename(expanded);
}

export async function buildSearchDirs(): Promise<SearchDirsResult> {
  const { config } = await readConfig();
  const globalPath = join(homedir(), ".kiro", "skills");

  const dirs: SearchDir[] = config.skill_paths.map((rawPath) => {
    const expanded = rawPath.startsWith("~")
      ? join(homedir(), rawPath.slice(1))
      : rawPath;
    return {
      dirPath: expanded,
      source: "workspace" as const,
      project: deriveProject(expanded),
    };
  });

  dirs.push({ dirPath: globalPath, source: "global", project: null });
  return { dirs, configCategories: config.skill_graph.categories };
}
