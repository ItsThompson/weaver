import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { globalSkillsPath, expandHome } from "@weaver/shared/paths";

export async function validatePathsExist(paths: string[]): Promise<string[]> {
  const resolved = paths.map((p) => resolve(expandHome(p)));
  const errors: string[] = [];

  const globalPath = globalSkillsPath();
  resolved.forEach((resolvedPath, i) => {
    if (resolvedPath === globalPath) {
      errors.push(
        `${paths[i]}: ~/.kiro/skills is reserved for global skills and cannot be included in skill_paths`,
      );
    }
  });

  const seen = new Set<string>();
  resolved.forEach((resolvedPath, i) => {
    if (seen.has(resolvedPath)) {
      errors.push(`Duplicate path: ${paths[i]}`);
    }
    seen.add(resolvedPath);
  });

  if (errors.length > 0) {
    return errors;
  }

  const statResults = await Promise.all(
    paths.map(async (originalPath, i) => {
      try {
        const stats = await stat(resolved[i]);
        if (!stats.isDirectory()) {
          return `${originalPath}: path is not a directory`;
        }
        return null;
      } catch {
        return `${originalPath}: path does not exist`;
      }
    }),
  );

  return statResults.filter((error): error is string => error !== null);
}
