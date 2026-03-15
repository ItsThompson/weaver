import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SkillGraph,
  SkillNode,
  SkillEdge,
  SkillDetail,
} from "@weaver/shared/types";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { FileCache } from "../file-cache/file-cache";
import { parseSkillFile } from "./parse-skill";
import { categorizeSkill } from "./category";
import { log } from "../../utils/logger";

interface ParsedSkill {
  frontmatter: Record<string, unknown>;
  body: string;
}

interface SkillEntry {
  name: string;
  source: "workspace" | "global";
  parsed: ParsedSkill;
}

const skillCache = new FileCache<ParsedSkill>();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findReferences(body: string, knownNames: string[]): string[] {
  if (knownNames.length === 0) {
    return [];
  }

  const pattern = new RegExp(
    `\`(${knownNames.map(escapeRegex).join("|")})\``,
    "g",
  );
  return [...new Set([...body.matchAll(pattern)].map((match) => match[1]))];
}

async function discoverSkills(cwd: string): Promise<SkillEntry[]> {
  const searchPaths = kiroSearchPaths(cwd, "skills");

  const pathResults = await Promise.all(
    searchPaths.map(async (dirPath, index) => {
      const source: "workspace" | "global" =
        index === 0 ? "workspace" : "global";
      const names = await listSkillDirNames(dirPath);

      const entries = await Promise.all(
        names.map(async (name): Promise<SkillEntry | null> => {
          const skillPath = join(dirPath, name, "SKILL.md");
          try {
            const parsed = await skillCache.get(skillPath, async () => {
              const content = await readFile(skillPath, "utf-8");
              return parseSkillFile(content);
            });
            return { name, source, parsed };
          } catch (error) {
            log({
              timestamp: new Date().toISOString(),
              event: "skill_parse_error",
              skill: name,
              path: skillPath,
              error: String(error),
            });
            return null;
          }
        }),
      );

      return entries.filter((entry): entry is SkillEntry => entry !== null);
    }),
  );

  // Flatten with workspace precedence: first occurrence wins.
  const seen = new Set<string>();
  return pathResults.flat().reduce<SkillEntry[]>((acc, entry) => {
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      acc.push(entry);
    }
    return acc;
  }, []);
}

export async function buildSkillGraph(cwd: string): Promise<SkillGraph> {
  const skills = await discoverSkills(cwd);
  const knownNames = skills.map((skill) => skill.name);

  const edgeCounts = new Map<string, { incoming: number; outgoing: number }>();
  knownNames.forEach((name) =>
    edgeCounts.set(name, { incoming: 0, outgoing: 0 }),
  );

  const edges: SkillEdge[] = skills.flatMap((skill) => {
    const otherNames = knownNames.filter((name) => name !== skill.name);
    const refs = findReferences(skill.parsed.body, otherNames);

    refs.forEach((ref) => {
      edgeCounts.get(skill.name)!.outgoing++;
      edgeCounts.get(ref)!.incoming++;
    });

    return refs.map((ref) => ({ from: skill.name, to: ref }));
  });

  const nodes: SkillNode[] = skills.map((skill) => ({
    name: (skill.parsed.frontmatter.name as string) ?? skill.name,
    description: String(skill.parsed.frontmatter.description ?? ""),
    category: categorizeSkill(skill.name, edgeCounts.get(skill.name)!),
    source: skill.source,
  }));

  return { nodes, edges };
}

export async function getSkillDetail(
  skillName: string,
  cwd: string,
): Promise<SkillDetail | null> {
  const searchPaths = kiroSearchPaths(cwd, "skills");

  for (const dirPath of searchPaths) {
    const skillPath = join(dirPath, skillName, "SKILL.md");
    try {
      return await skillCache.get(skillPath, async () => {
        const content = await readFile(skillPath, "utf-8");
        return parseSkillFile(content);
      });
    } catch {
      continue;
    }
  }

  return null;
}
