import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/skill-resolver";

import { readFile } from "node:fs/promises";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { log } from "../../utils/logger";
import { discoverSkills } from "./discover";

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
  vi.mocked(kiroSearchPaths).mockReturnValue([
    "/workspace/.kiro/skills",
    "/home/.kiro/skills",
  ]);
});

describe("discoverSkills", () => {
  it("returns entries from workspace and global paths", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_A;
      }
      return SKILL_B;
    });

    const entries = await discoverSkills("/workspace");

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ name: "skill-a", source: "workspace" });
    expect(entries[1]).toMatchObject({ name: "skill-b", source: "global" });
  });

  it("deduplicates with workspace precedence", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_A);

    const entries = await discoverSkills("/workspace");

    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe("workspace");
  });

  it("skips skills that fail to parse and logs the error", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["broken-skill"])
      .mockResolvedValueOnce([]);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const entries = await discoverSkills("/workspace");

    expect(entries).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "skill_parse_error",
        skill: "broken-skill",
      }),
    );
  });

  it("returns empty array when no skill directories exist", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const entries = await discoverSkills("/workspace");

    expect(entries).toEqual([]);
  });
});
