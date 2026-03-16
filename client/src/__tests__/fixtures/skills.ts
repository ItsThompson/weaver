import type { SkillGraph } from "@weaver/shared/types";

export const TEST_SKILL_GRAPH: SkillGraph = {
  nodes: [
    {
      id: "typescript::my-app",
      name: "typescript",
      skillName: "typescript",
      description: "TS lang",
      category: "language",
      source: "workspace",
      project: "my-app",
    },
    {
      id: "react::global",
      name: "react",
      skillName: "react",
      description: "React lib",
      category: "domain",
      source: "global",
      project: null,
    },
  ],
  edges: [{ from: "typescript::my-app", to: "react::global" }],
};
