import "../../__tests__/mocks/fs";

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { listSkillDirNames } from "./list-skill-dirs";

beforeEach(() => vi.clearAllMocks());

describe("listSkillDirNames", () => {
  it("returns skill directory names containing SKILL.md", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return (
        path === "/skills" ||
        path === join("/skills", "coding-practices", "SKILL.md")
      );
    });
    vi.mocked(readdir).mockResolvedValue([
      { name: "coding-practices", isDirectory: () => true },
    ] as any);

    expect(await listSkillDirNames("/skills")).toEqual(["coding-practices"]);
  });

  it("returns empty when directory does not exist", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(await listSkillDirNames("/missing")).toEqual([]);
  });

  it("skips non-directory entries", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockResolvedValue([
      { name: "README.md", isDirectory: () => false },
    ] as any);

    expect(await listSkillDirNames("/skills")).toEqual([]);
  });

  it("skips directories without SKILL.md", async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      // Directory exists, but SKILL.md inside does not
      return String(p) === "/skills";
    });
    vi.mocked(readdir).mockResolvedValue([
      { name: "incomplete", isDirectory: () => true },
    ] as any);

    expect(await listSkillDirNames("/skills")).toEqual([]);
  });

  it("returns empty when readdir throws", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdir).mockRejectedValue(new Error("EACCES"));

    expect(await listSkillDirNames("/skills")).toEqual([]);
  });
});
