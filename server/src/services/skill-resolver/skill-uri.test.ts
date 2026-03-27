import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { expandHome } from "@weaver/shared/paths";
import { resolveSkillUri } from "./skill-uri";

beforeEach(() => vi.clearAllMocks());

describe("expandHome", () => {
  it("expands ~/ to homedir", () => {
    expect(expandHome("~/skills")).toBe(`${homedir()}/skills`);
  });

  it("returns absolute paths unchanged", () => {
    expect(expandHome("/absolute/path")).toBe("/absolute/path");
  });

  it("returns relative paths unchanged", () => {
    expect(expandHome(".kiro/skills")).toBe(".kiro/skills");
  });
});

describe("resolveSkillUri", () => {
  it("resolves absolute skill:// URI with home expansion", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return (
        path === `${homedir()}/.kiro/skills` ||
        path === `${homedir()}/.kiro/skills/my-skill/SKILL.md`
      );
    });
    vi.mocked(readdir).mockResolvedValue([
      { name: "my-skill", isDirectory: () => true },
    ] as any);

    const result = await resolveSkillUri(
      "skill://~/.kiro/skills/*/SKILL.md",
      "/project",
    );
    expect(result).toEqual(["my-skill"]);
  });

  it("resolves relative skill:// URI against cwd", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return (
        path === "/project/.kiro/skills" ||
        path === "/project/.kiro/skills/local/SKILL.md"
      );
    });
    vi.mocked(readdir).mockResolvedValue([
      { name: "local", isDirectory: () => true },
    ] as any);

    const result = await resolveSkillUri(
      "skill://.kiro/skills/*/SKILL.md",
      "/project",
    );
    expect(result).toEqual(["local"]);
  });

  it("returns empty for URI without glob pattern", async () => {
    const result = await resolveSkillUri(
      "skill://~/.kiro/skills/specific/SKILL.md",
      "/project",
    );
    expect(result).toEqual([]);
  });
});
