import { log } from "../../utils/logger";
import { listSkillDirNames } from "./list-skill-dirs";
import { loadAgentConfig } from "./agent-config";
import { resolveSkillUri } from "./skill-uri";
import { kiroSearchPaths } from "./kiro-paths";

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

async function resolveDefaultAgentSkills(cwd: string): Promise<string[]> {
  const names = await Promise.all(
    kiroSearchPaths(cwd, "skills").map(listSkillDirNames),
  );
  return [...new Set(names.flat())];
}

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
