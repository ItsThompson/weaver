import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

export function categorizeSkill(
  name: string,
  configCategories: Record<string, SkillGraphCategoryConfig>,
  frontmatterCategory?: string,
): string | null {
  const configMatch = Object.keys(configCategories).find((key) =>
    configCategories[key].skills.includes(name),
  );
  if (configMatch) {
    return configMatch;
  }

  if (frontmatterCategory) {
    return frontmatterCategory;
  }

  return null;
}
