export interface SkillNodeData extends Record<string, unknown> {
  label: string;
  category: string | null;
  description: string;
  source: "global" | "workspace";
  color: string;
}
