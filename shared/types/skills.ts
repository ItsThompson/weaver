export enum SkillCategory {
  CORE = "core",
  LANGUAGE = "language",
  DOMAIN = "domain",
  WORKFLOW = "workflow",
}

export interface SkillNode {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  source: "global" | "workspace";
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
}
