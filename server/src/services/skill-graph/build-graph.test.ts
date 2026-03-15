vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  stat: vi.fn().mockRejectedValue(new Error("no stat mock")),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("../skill-resolver/kiro-paths", () => ({
  kiroSearchPaths: vi.fn(),
}));

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  log: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { buildSkillGraph, getSkillDetail } from "./build-graph";

const SKILL_A = `---
name: skill-a
description: Skill A description
---
Body of skill A with \`skill-b\` reference.`;

const SKILL_B = `---
name: skill-b
description: Skill B description
---
Body of skill B.`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(kiroSearchPaths).mockReturnValue([
    "/workspace/.kiro/skills",
    "/home/.kiro/skills",
  ]);
});

describe("buildSkillGraph", () => {
  it("builds nodes from skill directories", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

    const graph = await buildSkillGraph("/workspace");

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      name: "skill-a",
      description: "Skill A description",
      source: "workspace",
    });
  });

  it("detects backtick-wrapped references as edges", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a", "skill-b"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A;
      }
      return SKILL_B;
    });

    const graph = await buildSkillGraph("/workspace");

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toEqual({ from: "skill-a", to: "skill-b" });
  });

  it("deduplicates skills with workspace precedence", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

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

describe("getSkillDetail", () => {
  it("returns parsed frontmatter and body for existing skill", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

    const detail = await getSkillDetail("skill-a", "/workspace");

    expect(detail).toEqual({
      frontmatter: { name: "skill-a", description: "Skill A description" },
      body: expect.stringContaining("Body of skill A"),
    });
  });

  it("returns null for nonexistent skill", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const detail = await getSkillDetail("nonexistent", "/workspace");

    expect(detail).toBeNull();
  });
});
