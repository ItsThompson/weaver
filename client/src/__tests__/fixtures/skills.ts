import type { SkillGraph } from "@weaver/shared/types";
import { SkillCategory } from "@weaver/shared/types";

export const TEST_SKILL_GRAPH: SkillGraph = {
  nodes: [
    {
      id: "typescript",
      name: "typescript",
      description: "TS lang",
      category: SkillCategory.LANGUAGE,
      source: "workspace",
    },
    {
      id: "react",
      name: "react",
      description: "React lib",
      category: SkillCategory.DOMAIN,
      source: "global",
    },
  ],
  edges: [{ from: "typescript", to: "react" }],
};
