import type {
  SkillGraph,
  SkillNode,
  SkillEdge,
  SkillGraphCategoryConfig,
} from "@weaver/shared/types";
import { categorizeSkill } from "./category";
import { discoverSkills } from "./discover";
import { findReferences, extractFrontmatterString } from "./utils";
import type { SkillEntry } from "./types";

function resolveEdgeTarget(
  refName: string,
  sourceProject: string | null,
  skills: SkillEntry[],
): string | null {
  if (sourceProject === null) {
    const global = skills.find(
      (skill) => skill.name === refName && skill.project === null,
    );
    return global ? `${refName}::global` : null;
  }

  const sameProject = skills.find(
    (skill) => skill.name === refName && skill.project === sourceProject,
  );
  if (sameProject) {
    return `${refName}::${sourceProject}`;
  }

  const global = skills.find(
    (skill) => skill.name === refName && skill.project === null,
  );
  return global ? `${refName}::global` : null;
}

export async function buildSkillGraph(
  skillPaths: string[],
  configCategories: Record<string, SkillGraphCategoryConfig>,
): Promise<SkillGraph> {
  const skills = await discoverSkills(skillPaths);
  const knownNames = [...new Set(skills.map((skill) => skill.name))];

  const edges = skills.reduce<SkillEdge[]>((acc, skill) => {
    const otherNames = knownNames.filter((name) => name !== skill.name);
    const compositeId = `${skill.name}::${skill.project ?? "global"}`;
    findReferences(skill.parsed.body, otherNames).forEach((ref) => {
      const target = resolveEdgeTarget(ref, skill.project, skills);
      if (target) {
        acc.push({ from: compositeId, to: target });
      }
    });
    return acc;
  }, []);

  const nodes: SkillNode[] = skills.map((skill) => {
    const fm = skill.parsed.frontmatter.category;
    const frontmatterCategory = typeof fm === "string" ? fm : undefined;
    return {
      id: `${skill.name}::${skill.project ?? "global"}`,
      name: extractFrontmatterString(skill.parsed.frontmatter.name, skill.name),
      skillName: skill.name,
      description: String(skill.parsed.frontmatter.description ?? ""),
      category: categorizeSkill(
        skill.name,
        configCategories,
        frontmatterCategory,
      ),
      source: skill.source,
      project: skill.project,
    };
  });

  return { nodes, edges };
}
