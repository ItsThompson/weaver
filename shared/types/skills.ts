export interface SkillVariant {
  source: "global" | "workspace";
  project: string | null;
}

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  category: string | null;
  source: "global" | "workspace";
  project: string | null;
  variants: SkillVariant[];
}

export interface SkillEdge {
  from: string;
  to: string;
}

export interface SkillGraph {
  nodes: SkillNode[];
  edges: SkillEdge[];
}

export interface SkillDetail {
  frontmatter: Record<string, unknown>;
  body: string;
  source: "global" | "workspace";
  category: string | null;
  project: string | null;
}
