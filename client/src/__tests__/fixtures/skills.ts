import type { SkillGraph } from "@weaver/shared/types";

export const TEST_SKILL_GRAPH: SkillGraph = {
  nodes: [
    {
      id: "typescript",
      name: "typescript",
      description: "TS lang",
      category: "language",
      source: "workspace",
      project: "my-app",
      variants: [{ source: "workspace", project: "my-app" }],
    },
    {
      id: "react",
      name: "react",
      description: "React lib",
      category: "domain",
      source: "global",
      project: null,
      variants: [{ source: "global", project: null }],
    },
  ],
  edges: [{ from: "typescript", to: "react" }],
};
