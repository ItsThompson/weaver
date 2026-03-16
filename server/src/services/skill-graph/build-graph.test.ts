import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile } from "node:fs/promises";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { buildSkillGraph } from "./build-graph";
import {
  SKILL_A_CONTENT,
  SKILL_B_CONTENT,
} from "../../__tests__/fixtures/skills";
import type { SkillGraphCategoryConfig } from "@weaver/shared/types";

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

const testCategories: Record<string, SkillGraphCategoryConfig> = {
  core: { skills: ["skill-a"] },
  language: { skills: ["skill-b"] },
};

beforeEach(() => vi.clearAllMocks());

describe("buildSkillGraph", () => {
  it("builds nodes with composite id, skillName, and project", async () => {
    // workspace path + global path
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph(
      ["/projects/my-app/.kiro/skills"],
      testCategories,
    );

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "skill-a::my-app",
      name: "Skill A",
      skillName: "skill-a",
      source: "workspace",
      project: "my-app",
    });
  });

  it("global skills have composite id with 'global'", async () => {
    // no workspace paths, only global
    vi.mocked(listSkillDirNames).mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_B_CONTENT);

    const graph = await buildSkillGraph([], testCategories);

    expect(graph.nodes[0]).toMatchObject({
      id: "skill-b::global",
      project: null,
      source: "global",
    });
  });

  it("does not deduplicate same-named skills from different projects", async () => {
    // workspace path + global path
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph(
      ["/projects/my-app/.kiro/skills"],
      testCategories,
    );

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].id).toBe("skill-a::my-app");
    expect(graph.nodes[1].id).toBe("skill-a::global");
  });

  it("applies config category to matching skill", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph(
      ["/projects/my-app/.kiro/skills"],
      testCategories,
    );

    expect(graph.nodes[0].category).toBe("core");
  });

  it("scoped edges: project skill references same-project first", async () => {
    // workspace has both skill-a and skill-b, global also has skill-b
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a", "skill-b"])
      .mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A_CONTENT;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph(["/projects/foo/.kiro/skills"], {});

    const edgesFromA = graph.edges.filter(
      (edge) => edge.from === "skill-a::foo",
    );
    expect(edgesFromA).toEqual([{ from: "skill-a::foo", to: "skill-b::foo" }]);
  });

  it("scoped edges: project skill falls back to global", async () => {
    // workspace has only skill-a, global has skill-b
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A_CONTENT;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph(["/projects/foo/.kiro/skills"], {});

    expect(graph.edges).toEqual([
      { from: "skill-a::foo", to: "skill-b::global" },
    ]);
  });

  it("scoped edges: global skill only references global", async () => {
    const globalA = `---\nname: Skill A\n---\nBody with \`skill-b\` ref.`;
    // workspace has skill-b, global has skill-a and skill-b
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-b"])
      .mockResolvedValueOnce(["skill-a", "skill-b"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return globalA;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph(["/projects/foo/.kiro/skills"], {});

    const globalEdges = graph.edges.filter(
      (edge) => edge.from === "skill-a::global",
    );
    expect(globalEdges).toEqual([
      { from: "skill-a::global", to: "skill-b::global" },
    ]);
  });

  it("scoped edges: global cannot reference project-only skill", async () => {
    const globalA = `---\nname: Skill A\n---\nBody with \`skill-b\` ref.`;
    // workspace has skill-b, global has only skill-a (no skill-b)
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-b"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return globalA;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph(["/projects/foo/.kiro/skills"], {});

    const globalEdges = graph.edges.filter(
      (edge) => edge.from === "skill-a::global",
    );
    expect(globalEdges).toEqual([]);
  });

  it("scoped edges: no cross-project references", async () => {
    // project foo has skill-a, project bar has skill-b, global has nothing
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-b"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A_CONTENT;
      }
      return SKILL_B_CONTENT;
    });

    const graph = await buildSkillGraph(
      ["/projects/foo/.kiro/skills", "/projects/bar/.kiro/skills"],
      {},
    );

    expect(graph.edges).toEqual([]);
  });

  it("handles empty skill directories", async () => {
    vi.mocked(listSkillDirNames).mockResolvedValue([]);

    const graph = await buildSkillGraph([], {});

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
