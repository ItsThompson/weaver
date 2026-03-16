import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/config";

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { readConfig } from "../config/index";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { buildSkillGraph } from "./build-graph";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";
import {
  SKILL_A_CONTENT,
  SKILL_B_CONTENT,
  SKILL_NUMERIC_NAME_CONTENT,
} from "../../__tests__/fixtures/skills";

const testCategories: Record<string, SkillGraphCategoryConfig> = {
  core: { skills: ["skill-a"] },
  language: { skills: ["skill-b"] },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({
    config: {
      ...DEFAULT_CONFIG,
      skill_paths: ["/workspace/.kiro/skills"],
      skill_graph: { categories: testCategories },
    },
    warnings: [],
    fieldErrors: {},
  });
});

describe("buildSkillGraph", () => {
  it("builds nodes with stable id, display name, project, and variants", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph();

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "skill-a",
      name: "Skill A",
      description: "Skill A description",
      source: "workspace",
      project: "workspace",
      variants: [{ source: "workspace", project: "workspace" }],
    });
  });

  it("applies config category to matching skill", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph();

    expect(graph.nodes[0].category).toBe("core");
  });

  it("returns null category for uncategorized skill", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        skill_paths: ["/workspace/.kiro/skills"],
        skill_graph: { categories: {} },
      },
      warnings: [],
      fieldErrors: {},
    });
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph();

    expect(graph.nodes[0].category).toBeNull();
  });

  it("falls back to directory name when frontmatter name is not a string", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["my-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_NUMERIC_NAME_CONTENT);

    const graph = await buildSkillGraph();

    expect(graph.nodes[0].id).toBe("my-skill");
    expect(graph.nodes[0].name).toBe("my-skill");
  });

  it("detects backtick-wrapped references as edges using directory names", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a", "skill-b"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A_CONTENT;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph();

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: "skill-a", to: "skill-b" });
  });

  it("deduplicates skills: one node with multiple variants", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph();

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].source).toBe("workspace");
    expect(graph.nodes[0].variants).toHaveLength(2);
    expect(graph.nodes[0].variants[0].source).toBe("workspace");
    expect(graph.nodes[0].variants[1].source).toBe("global");
  });

  it("handles empty skill directories", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const graph = await buildSkillGraph();

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("handles missing SKILL.md files gracefully", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["broken-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const graph = await buildSkillGraph();

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
