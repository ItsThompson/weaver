import type { SkillGraph, SkillNode, SkillEdge } from "@weaver/shared/types";
import { categorizeSkill } from "./category";
import { discoverSkills } from "./discover";

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

function extractFrontmatterString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
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
    id: skill.name,
    name: extractFrontmatterString(skill.parsed.frontmatter.name, skill.name),
    description: String(skill.parsed.frontmatter.description ?? ""),
    category: categorizeSkill(skill.name, edgeCounts.get(skill.name)!),
    source: skill.source,
  }));

  return { nodes, edges };
}
