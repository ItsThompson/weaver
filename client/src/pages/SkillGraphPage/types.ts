import type { SkillVariant } from "@weaver/shared/types";

export interface SkillNodeData extends Record<string, unknown> {
  label: string;
  category: string | null;
  description: string;
  source: "global" | "workspace";
  project: string | null;
  variants: SkillVariant[];
  color: string;
}
