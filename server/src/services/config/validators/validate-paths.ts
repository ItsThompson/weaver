import { stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

const GLOBAL_SKILLS_PATH = () => resolve(join(homedir(), ".kiro", "skills"));

export async function validatePathsExist(paths: string[]): Promise<string[]> {
  const resolved = paths.map((p) => resolve(expandHome(p)));
  const errors: string[] = [];

  const globalPath = GLOBAL_SKILLS_PATH();
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
