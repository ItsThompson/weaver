import type {
  SkillGraph,
  SkillNode,
  SkillEdge,
  SkillGraphCategoryConfig,
} from "@weaver/shared/types";
import { categorizeSkill } from "./category";
import { discoverSkills } from "./discover";
import { findReferences, extractFrontmatterString } from "./utils";

export async function buildSkillGraph(
  cwd: string,
  configCategories: Record<string, SkillGraphCategoryConfig>,
): Promise<SkillGraph> {
  const skills = await discoverSkills(cwd);
  const knownNames = skills.map((skill) => skill.name);

  const edges = skills.reduce<SkillEdge[]>((acc, skill) => {
    const otherNames = knownNames.filter((name) => name !== skill.name);
    findReferences(skill.parsed.body, otherNames).forEach((ref) => {
      acc.push({ from: skill.name, to: ref });
    });
    return acc;
  }, []);

  const nodes: SkillNode[] = skills.map((skill) => {
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
    };
  });

  return { nodes, edges };
}
