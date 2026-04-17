import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import matter from "gray-matter";

/**
 * Returns workspace-first then global search paths for Claude Code agent files.
 */
function agentSearchPaths(
  cwd: string,
  agentName: string,
): string[] {
  return [
    join(cwd, ".claude", "agents", `${agentName}.md`),
    join(homedir(), ".claude", "agents", `${agentName}.md`),
  ];
}

/**
 * Loads a Claude Code agent's YAML frontmatter from its markdown file.
 * Searches workspace (.claude/agents/<name>.md) then global (~/.claude/agents/<name>.md).
 * Returns the parsed frontmatter object, or null if no file is found or parsing fails.
 */
export async function loadAgentConfig(
  agentName: string,
  cwd: string,
): Promise<Record<string, unknown> | null> {
  const configPath = agentSearchPaths(cwd, agentName).find((p) =>
    existsSync(p),
  );
  if (!configPath) {
    return null;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const { data } = matter(content);
    return data;
  } catch {
    return null;
  }
}
