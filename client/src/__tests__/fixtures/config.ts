import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

export const CONFIG_WITH_CATEGORIES: WeaverConfig = {
  ...DEFAULT_CONFIG,
  skill_graph: {
    categories: {
      core: { color: "#ff6b6b", skills: ["coding-practices"] },
      language: { skills: ["typescript-standards"] },
    },
  },
};
