import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { listSkillDirNames } from "../skill-resolver/list-skill-dirs";
import { log } from "../../utils/logger";
import {
  SKILL_BASIC_CONTENT,
  SKILL_B_CONTENT,
} from "../../__tests__/fixtures/skills";
import { discoverSkills, deriveProject } from "./discover";

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("deriveProject", () => {
  it("strips .kiro/skills suffix and returns basename", () => {
    expect(deriveProject("/projects/my-app/.kiro/skills")).toBe("my-app");
  });

  it("strips .kiro/skills suffix with tilde path", () => {
    expect(deriveProject("~/projects/my-app/.kiro/skills")).toBe("my-app");
  });

  it("returns basename for plain path", () => {
    expect(deriveProject("/some/custom-skills")).toBe("custom-skills");
  });

  it("handles trailing slash", () => {
    expect(deriveProject("/foo/bar/")).toBe("bar");
  });

  it("handles redundant separators", () => {
    expect(deriveProject("/foo//bar")).toBe("bar");
  });
});

describe("discoverSkills", () => {
  it("returns skills from workspace paths with correct project", async () => {
    vi.mocked(listSkillDirNames).mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const entries = await discoverSkills([
      { path: "/projects/my-app/.kiro/skills", source: "workspace" },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "skill-a",
      source: "workspace",
      project: "my-app",
    });
  });

  it("returns global skills with project null", async () => {
    vi.mocked(listSkillDirNames).mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_B_CONTENT);

    const entries = await discoverSkills([
      { path: "/home/user/.kiro/skills", source: "global" },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "skill-b",
      source: "global",
      project: null,
    });
  });

  it("does NOT deduplicate same-named skills from different paths", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-a"]);
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const entries = await discoverSkills([
      { path: "/projects/my-app/.kiro/skills", source: "workspace" },
      { path: "/home/user/.kiro/skills", source: "global" },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe("workspace");
    expect(entries[1].source).toBe("global");
  });

  it("returns skills from multiple workspace paths", async () => {
    vi.mocked(listSkillDirNames)
      .mockResolvedValueOnce(["skill-a"])
      .mockResolvedValueOnce(["skill-b"]);
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).includes("skill-a")) {
        return SKILL_BASIC_CONTENT;
      }
      return SKILL_B_CONTENT;
    });

    const entries = await discoverSkills([
      { path: "/projects/app-one/.kiro/skills", source: "workspace" },
      { path: "/projects/app-two/.kiro/skills", source: "workspace" },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      project: "app-one",
      source: "workspace",
    });
    expect(entries[1]).toMatchObject({
      project: "app-two",
      source: "workspace",
    });
  });

  it("skips skills that fail to parse and logs the error", async () => {
    vi.mocked(listSkillDirNames).mockResolvedValueOnce(["broken-skill"]);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const entries = await discoverSkills([
      { path: "/projects/my-app/.kiro/skills", source: "workspace" },
    ]);

    expect(entries).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "skill_parse_error",
        skill: "broken-skill",
      }),
    );
  });

  it("returns empty array when no skill paths provided", async () => {
    const entries = await discoverSkills([]);
    expect(entries).toEqual([]);
  });
});
