import type { SkillGraph, SkillNode, SkillEdge } from "@weaver/shared/types";
import { categorizeSkill } from "./category";
import { discoverSkills } from "./discover";
import { findReferences, extractFrontmatterString } from "./utils";
import type { SkillEntry } from "./types";

export async function buildSkillGraph(): Promise<SkillGraph> {
  const { entries: skills, configCategories } = await discoverSkills();

  const grouped = skills.reduce<Map<string, SkillEntry[]>>((acc, skill) => {
    const existing = acc.get(skill.name);
    if (existing) {
      existing.push(skill);
    } else {
      acc.set(skill.name, [skill]);
    }
    return acc;
  }, new Map());

  const uniqueSkills = [...grouped.values()].map((entries) => entries[0]);
  const knownNames = uniqueSkills.map((skill) => skill.name);

  const edges = uniqueSkills.reduce<SkillEdge[]>((acc, skill) => {
    const otherNames = knownNames.filter((name) => name !== skill.name);
    findReferences(skill.parsed.body, otherNames).forEach((ref) => {
      acc.push({ from: skill.name, to: ref });
    });
    return acc;
  }, []);

  const nodes: SkillNode[] = uniqueSkills.map((skill) => {
    const allEntries = grouped.get(skill.name)!;
    const fm = skill.parsed.frontmatter.category;
    const frontmatterCategory = typeof fm === "string" ? fm : undefined;
    return {
      id: skill.name,
      name: extractFrontmatterString(skill.parsed.frontmatter.name, skill.name),
      description: String(skill.parsed.frontmatter.description ?? ""),
      category: categorizeSkill(
        skill.name,
        configCategories,
        frontmatterCategory,
      ),
      source: skill.source,
      project: skill.project,
      variants: allEntries.map((entry) => ({
        source: entry.source,
        project: entry.project,
      })),
    };
  });

  return { nodes, edges };
}
