import { join } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileCache } from "../file-cache/index";

const configCache = new FileCache<Record<string, unknown>>();
export const _configCache = configCache;

export async function loadAgentConfig(
  agentName: string,
  cwd: string,
): Promise<Record<string, unknown> | null> {
  const candidates = [
    join(cwd, ".kiro", "agents", `${agentName}.json`),
    join(homedir(), ".kiro", "agents", `${agentName}.json`),
  ];

  for (const configPath of candidates) {
    if (!existsSync(configPath)) {
      continue;
    }
    try {
      return await configCache.get(configPath, async () =>
        JSON.parse(await readFile(configPath, "utf-8")),
      );
    } catch {
      continue;
    }
  }
  return null;
}
