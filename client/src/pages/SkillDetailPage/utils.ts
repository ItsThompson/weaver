import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

export function buildUpdatedCategories(
  oldCategories: Record<string, SkillGraphCategoryConfig>,
  skillName: string,
  newCategory: string,
): Record<string, SkillGraphCategoryConfig> {
  const updated = Object.entries(oldCategories).reduce<
    Record<string, SkillGraphCategoryConfig>
  >((acc, [name, entry]) => {
    acc[name] = {
      ...(entry.color ? { color: entry.color } : {}),
      skills: entry.skills.filter((skill) => skill !== skillName),
    };
    return acc;
  }, {});

  if (newCategory !== "__uncategorized__" && updated[newCategory]) {
    updated[newCategory] = {
      ...updated[newCategory],
      skills: [...updated[newCategory].skills, skillName],
    };
  }

  return updated;
}
