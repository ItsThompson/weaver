import type { SkillCategory } from "@weaver/shared/types";

export interface SkillNodeData extends Record<string, unknown> {
  label: string;
  category: SkillCategory;
  description: string;
  source: "global" | "workspace";
}
