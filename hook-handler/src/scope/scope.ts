import { realpathSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { StopValidationHook } from "@weaver/shared/types";

export function resolveTestDirs(
  changedFiles: string[],
  scope: StopValidationHook["scope"],
  cwd: string,
  agentTestedDirs: string[],
): string[] {
  const dirs = new Set(changedFiles.map((f) => resolveDir(f, scope, cwd)));
  const deduped = collapseSubdirs([...dirs]);
  return deduped.filter(
    (d) => !agentTestedDirs.some((a) => d === a || d.startsWith(a + "/")),
  );
}

function resolveDir(
  file: string,
  scope: StopValidationHook["scope"],
  cwd: string,
): string {
  try {
    const abs = realpathSync(resolve(cwd, file));
    if (!abs.startsWith(cwd)) {
      return ".";
    }
    const dir = applyScope(relative(cwd, abs), scope);
    return dir.startsWith("..") ? "." : dir || ".";
  } catch {
    return ".";
  }
}

function applyScope(rel: string, scope: StopValidationHook["scope"]): string {
  if (scope === undefined || scope === "cwd") {
    return ".";
  }
  const dir = dirname(rel);
  const depth = scope === "file" ? 0 : scope === "parent" ? 1 : scope;
  return Array.from({ length: depth }).reduce<string>((cur) => {
    const parent = dirname(cur);
    return parent === cur ? cur : parent;
  }, dir);
}

function collapseSubdirs(dirs: string[]): string[] {
  dirs.sort((a, b) =>
    a === "." ? -1 : b === "." ? 1 : a.split("/").length - b.split("/").length,
  );
  return dirs.reduce<string[]>(
    (kept, d) =>
      kept.some((k) => d === k || d.startsWith(k + "/")) ? kept : [...kept, d],
    [],
  );
}
