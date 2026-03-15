import type { SkillGraph, SkillNode, SkillEdge } from "@weaver/shared/types";
import { categorizeSkill } from "./category";
import { discoverSkills } from "./discover";
import { findReferences, extractFrontmatterString } from "./utils";

export async function buildSkillGraph(cwd: string): Promise<SkillGraph> {
  const skills = await discoverSkills(cwd);
  const knownNames = skills.map((skill) => skill.name);

  const edgeCounts = new Map<string, { incoming: number; outgoing: number }>();
  knownNames.forEach((name) =>
    edgeCounts.set(name, { incoming: 0, outgoing: 0 }),
  );

  const edges = skills.reduce<SkillEdge[]>((acc, skill) => {
    const otherNames = knownNames.filter((name) => name !== skill.name);
    const refs = findReferences(skill.parsed.body, otherNames);

    refs.forEach((ref) => {
      edgeCounts.get(skill.name)!.outgoing++;
      edgeCounts.get(ref)!.incoming++;
      acc.push({ from: skill.name, to: ref });
    });

    return acc;
  }, []);

  const nodes: SkillNode[] = skills.map((skill) => ({
    id: skill.name,
    name: extractFrontmatterString(skill.parsed.frontmatter.name, skill.name),
    description: String(skill.parsed.frontmatter.description ?? ""),
    category: categorizeSkill(skill.name, edgeCounts.get(skill.name)!),
    source: skill.source,
  }));

  return { nodes, edges };
}
