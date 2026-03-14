import { dirname } from "node:path";
import { readProjectConfig } from "../project-config";
import type { WeaverProjectConfig } from "@weaver/shared/types";

export interface ConfigMatch {
  config: WeaverProjectConfig;
  configRoot: string;
}

export function findNearestConfig(startDir: string): ConfigMatch | null {
  let dir = startDir;
  while (true) {
    const config = readProjectConfig(dir);
    if (config) {
      return { config, configRoot: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function groupFilesByConfig(
  files: string[],
): Map<string, { config: WeaverProjectConfig; files: string[] }> {
  const groups = new Map<
    string,
    { config: WeaverProjectConfig; files: string[] }
  >();
  files.forEach((file) => {
    const match = findNearestConfig(dirname(file));
    if (!match) {
      return;
    }
    const existing = groups.get(match.configRoot);
    if (existing) {
      existing.files.push(file);
    } else {
      groups.set(match.configRoot, { config: match.config, files: [file] });
    }
  });
  return groups;
}
