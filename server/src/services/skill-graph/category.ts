import { SkillCategory } from "@weaver/shared/types";

const STATIC_CATEGORIES: Record<string, SkillCategory> = {
  "coding-practices": SkillCategory.CORE,
  "testing-practices": SkillCategory.WORKFLOW,
  "data-safety": SkillCategory.WORKFLOW,
  "component-decomposition": SkillCategory.WORKFLOW,
  "typescript-standards": SkillCategory.LANGUAGE,
  "backend-coding-practices": SkillCategory.DOMAIN,
  "frontend-coding-practices": SkillCategory.DOMAIN,
  "infra-coding-practices": SkillCategory.DOMAIN,
  "brazil-build": SkillCategory.DOMAIN,
  "writing-style": SkillCategory.WORKFLOW,
};

export function categorizeSkill(
  name: string,
  edgeCount: { incoming: number; outgoing: number },
): SkillCategory {
  const mapped = STATIC_CATEGORIES[name];
  if (mapped) {
    return mapped;
  }

  if (edgeCount.outgoing >= 3) {
    return SkillCategory.CORE;
  }
  if (edgeCount.incoming >= 3) {
    return SkillCategory.LANGUAGE;
  }
  return SkillCategory.DOMAIN;
}
