import { log } from "../../utils/logger";
import { listSkillDirNames } from "./list-skill-dirs";
import { resolveSkillUri } from "./skill-uri";

/**
 * Resolves configured skill names for a session's agent.
 * For the default agent (null), lists skill directories from the provided search paths.
 * For custom agents, the caller provides a config loader that returns the agent's config.
 * Returns `[]` on any failure.
 */
export async function resolveConfiguredSkills(
  agentName: string | null,
  skillSearchPaths: string[],
  loadAgentConfig?: (
    agentName: string,
  ) => Promise<Record<string, unknown> | null>,
  cwd?: string,
): Promise<string[]> {
  try {
    if (!agentName) {
      return await resolveDefaultAgentSkills(skillSearchPaths);
    }
    if (!loadAgentConfig || !cwd) {
      return [];
    }
    return await resolveCustomAgentSkills(agentName, loadAgentConfig, cwd);
  } catch (error) {
    log({
      timestamp: new Date().toISOString(),
      event: "resolve_configured_skills_error",
      agentName,
      error: String(error),
    });
    return [];
  }
}

/** Collects deduplicated skill directory names from the provided skill directories. */
async function resolveDefaultAgentSkills(
  skillSearchPaths: string[],
): Promise<string[]> {
  const names = await Promise.all(skillSearchPaths.map(listSkillDirNames));
  return [...new Set(names.flat())];
}

/** Reads a custom agent's config and resolves its `skill://` resource URIs to skill directory names. */
async function resolveCustomAgentSkills(
  agentName: string,
  loadAgentConfig: (
    agentName: string,
  ) => Promise<Record<string, unknown> | null>,
  cwd: string,
): Promise<string[]> {
  const config = await loadAgentConfig(agentName);
  if (!config) {
    return [];
  }

  const resources = config.resources;
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
