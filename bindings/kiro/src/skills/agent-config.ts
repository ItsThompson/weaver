import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { kiroSearchPaths } from "./kiro-paths";

/**
 * Loads a custom agent's JSON config, checking workspace then global `.kiro/agents/`.
 * Returns null if no config is found or the file is malformed.
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
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
