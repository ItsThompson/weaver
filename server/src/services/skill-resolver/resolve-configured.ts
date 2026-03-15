import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { log } from "../../utils/logger";
import { listSkillDirNames } from "./list-skill-dirs";
import { loadAgentConfig } from "./agent-config";

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
  const dirs = [
    join(cwd, ".kiro", "skills"),
    join(homedir(), ".kiro", "skills"),
  ];
  const names = await Promise.all(dirs.map(listSkillDirNames));
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

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

async function resolveSkillUri(uri: string, cwd: string): Promise<string[]> {
  const rawPath = uri.slice("skill://".length);
  const expanded = expandHome(rawPath);

  const globIndex = expanded.indexOf("*/");
  if (globIndex === -1) {
    return [];
  }

  const rawBase = expanded.slice(0, globIndex);
  const baseDir = expanded.startsWith("/")
    ? rawBase.replace(/\/+$/, "")
    : resolve(cwd, rawBase);

  return listSkillDirNames(baseDir);
}
