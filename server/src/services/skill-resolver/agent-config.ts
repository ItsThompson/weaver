import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileCache } from "../file-cache/index";
import { kiroSearchPaths } from "./kiro-paths";

const configCache = new FileCache<Record<string, unknown>>();
export const _configCache = configCache;

/**
 * Loads a custom agent's JSON config, checking workspace then global `.kiro/agents/`.
 * Results are cached by file path via FileCache. Returns null if no config is found.
 */
export async function loadAgentConfig(
  agentName: string,
  cwd: string,
): Promise<Record<string, unknown> | null> {
  const configPath = kiroSearchPaths(cwd, "agents", `${agentName}.json`).find(
    (p) => existsSync(p),
  );
  if (!configPath) {
    return null;
  }

  try {
    return await configCache.get(configPath, () =>
      readFile(configPath, "utf-8").then((content) => JSON.parse(content)),
    );
  } catch {
    return null;
  }
}
