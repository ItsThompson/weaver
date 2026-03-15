import { log } from "../../utils/logger";
import { listSkillDirNames } from "./list-skill-dirs";
import { loadAgentConfig } from "./agent-config";
import { resolveSkillUri } from "./skill-uri";
import { kiroSearchPaths } from "./kiro-paths";

/**
 * Resolves configured skill names for a session's agent.
 * For the default agent (null), lists skill directories in workspace and global `.kiro/skills/`.
 * For custom agents, reads the agent config and resolves `skill://` URIs from its resources.
 * Returns `[]` on any failure.
 */
export async function resolveConfiguredSkills(
  agentName: string | null,
  cwd: string,
): Promise<string[]> {
  try {
    if (!agentName) {
      return await resolveDefaultAgentSkills(cwd);
    }
    return await resolveCustomAgentSkills(agentName, cwd);
  } catch (error) {
    log({
      timestamp: new Date().toISOString(),
      event: "resolve_configured_skills_error",
      agentName,
      cwd,
      error: String(error),
    });
    return [];
  }
}

/** Collects deduplicated skill directory names from workspace and global skill directories. */
async function resolveDefaultAgentSkills(cwd: string): Promise<string[]> {
  const names = await Promise.all(
    kiroSearchPaths(cwd, "skills").map(listSkillDirNames),
  );
  return [...new Set(names.flat())];
}

/** Reads a custom agent's config and resolves its `skill://` resource URIs to skill directory names. */
async function resolveCustomAgentSkills(
  agentName: string,
  cwd: string,
): Promise<string[]> {
  const config = await loadAgentConfig(agentName, cwd);
  if (!config) {
    return [];
  }

  const resources = (config as { resources?: unknown[] }).resources;
  if (!Array.isArray(resources)) {
    return [];
  }

  const skillUris = resources.filter(
    (r): r is string => typeof r === "string" && r.startsWith("skill://"),
  );

  const names = await Promise.all(
    skillUris.map((uri) => resolveSkillUri(uri, cwd)),
  );
  return [...new Set(names.flat())];
}
