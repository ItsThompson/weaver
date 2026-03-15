import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/skill-resolver";

import { readFile } from "node:fs/promises";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { buildSkillGraph } from "./build-graph";
import {
  SKILL_A_CONTENT,
  SKILL_B_CONTENT,
  SKILL_NUMERIC_NAME_CONTENT,
  SEARCH_PATHS,
} from "../../__tests__/fixtures/skills";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(kiroSearchPaths).mockReturnValue([...SEARCH_PATHS]);
});

describe("buildSkillGraph", () => {
  it("builds nodes with stable id and display name from frontmatter", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph("/workspace");

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "skill-a",
      name: "Skill A",
      description: "Skill A description",
      source: "workspace",
    });
  });

  it("falls back to directory name when frontmatter name is not a string", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["my-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_NUMERIC_NAME_CONTENT);

    const graph = await buildSkillGraph("/workspace");

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

    const graph = await buildSkillGraph("/workspace");

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: "skill-a", to: "skill-b" });
  });

  it("deduplicates skills with workspace precedence", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A_CONTENT);

    const graph = await buildSkillGraph("/workspace");

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].source).toBe("workspace");
  });

  it("handles empty skill directories", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const graph = await buildSkillGraph("/workspace");

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("handles missing SKILL.md files gracefully", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["broken-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const graph = await buildSkillGraph("/workspace");

    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
