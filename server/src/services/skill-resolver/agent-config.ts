import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileCache } from "../file-cache/index";
import { kiroSearchPaths } from "./kiro-paths";

const configCache = new FileCache<Record<string, unknown>>();
export const _configCache = configCache;

export async function loadAgentConfig(
  agentName: string,
  cwd: string,
): Promise<Record<string, unknown> | null> {
  const existing = kiroSearchPaths(cwd, "agents", `${agentName}.json`).filter(
    (p) => existsSync(p),
  );

  return existing.reduce<Promise<Record<string, unknown> | null>>(
    async (prev, configPath) => {
      const result = await prev;
      if (result) {
        return result;
      }
      try {
        return await configCache.get(configPath, async () =>
          JSON.parse(await readFile(configPath, "utf-8")),
        );
      } catch {
        return null;
      }
    },
    Promise.resolve(null),
  );
}
