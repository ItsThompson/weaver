import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { FileCache } from "../file-cache/index";
import { log } from "../../utils/logger";

const configCache = new FileCache<Record<string, unknown>>();
export const _configCache = configCache;

export function skillNameFromPath(skillMdPath: string): string {
  return basename(dirname(skillMdPath));
}

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

async function loadAgentConfig(
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

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }
  return filePath;
}

async function resolveSkillUri(uri: string, cwd: string): Promise<string[]> {
  // skill://~/.config/amazonq/global/skills/*/SKILL.md → ~/.config/amazonq/global/skills/
  // skill://.kiro/skills/*/SKILL.md → {cwd}/.kiro/skills/
  const rawPath = uri.slice("skill://".length);
  const expanded = expandHome(rawPath);

  // Extract base directory: everything before */SKILL.md
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

async function listSkillDirNames(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    return entries.reduce<string[]>((names, entry) => {
      if (
        entry.isDirectory() &&
        existsSync(join(dirPath, entry.name, "SKILL.md"))
      ) {
        names.push(entry.name);
      }
      return names;
    }, []);
  } catch {
    return [];
  }
}
