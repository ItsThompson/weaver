import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/config";

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { readConfig } from "../config/index";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { log } from "../../utils/logger";
import { discoverSkills } from "./discover";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

const SKILL_A = `---
name: skill-a
description: Skill A description
---
Body of skill A.`;

const SKILL_B = `---
name: skill-b
description: Skill B description
---
Body of skill B.`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({
    config: {
      ...DEFAULT_CONFIG,
      skill_paths: ["/projects/my-app/.kiro/skills"],
    },
    warnings: [],
    fieldErrors: {},
  });
});

describe("discoverSkills", () => {
  it("discovers skills from configured paths as workspace source with correct project", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

    const { entries } = await discoverSkills();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "skill-a",
      source: "workspace",
      project: "my-app",
    });
  });

  it("always includes global ~/.kiro/skills with project null", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_B);

    const { entries } = await discoverSkills();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "skill-b",
      source: "global",
      project: null,
    });
  });

  it("returns all entries including duplicates", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

    const { entries } = await discoverSkills();

    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe("workspace");
    expect(entries[1].source).toBe("global");
  });

  it("returns configCategories from config alongside entries", async () => {
    const categories = { core: { skills: ["skill-a"] } };
    vi.mocked(readConfig).mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        skill_paths: [],
        skill_graph: { categories },
      },
      warnings: [],
      fieldErrors: {},
    });
    vi.mocked(listSkillDirNames).mockResolvedValueOnce([]);

    const { configCategories } = await discoverSkills();

    expect(configCategories).toEqual(categories);
  });

  it("returns empty array when no paths configured and global is empty", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: { ...DEFAULT_CONFIG, skill_paths: [] },
      warnings: [],
      fieldErrors: {},
    });
    vi.mocked(listSkillDirNames).mockResolvedValueOnce([]);

    const { entries } = await discoverSkills();

    expect(entries).toEqual([]);
  });

  it("skips skills that fail to parse and logs the error", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["broken-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const { entries } = await discoverSkills();

    expect(entries).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "skill_parse_error",
        skill: "broken-skill",
      }),
    );
  });
});
