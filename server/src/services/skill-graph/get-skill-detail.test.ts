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

vi.mock("../../utils/logger", () => ({
  log: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { log } from "../../utils/logger";
import { getSkillDetail } from "./get-skill-detail";

const SKILL_CONTENT = `---
name: skill-a
description: Skill A description
---
Body of skill A.`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(kiroSearchPaths).mockReturnValue([
    "/workspace/.kiro/skills",
    "/home/.kiro/skills",
  ]);
});

describe("getSkillDetail", () => {
  it("returns parsed frontmatter and body for existing skill", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_CONTENT);

    const detail = await getSkillDetail("skill-a", "/workspace");

    expect(detail).toEqual({
      frontmatter: { name: "skill-a", description: "Skill A description" },
      body: expect.stringContaining("Body of skill A"),
    });
  });

  it("returns null for nonexistent skill", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    vi.mocked(readFile).mockRejectedValue(enoent);

    const detail = await getSkillDetail("nonexistent", "/workspace");

    expect(detail).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const detail = await getSkillDetail("../../etc", "/workspace");

    expect(detail).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects skill names with invalid characters", async () => {
    const detail = await getSkillDetail("skill/name", "/workspace");

    expect(detail).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rethrows non-ENOENT errors", async () => {
    const permError = new Error(
      "EACCES: permission denied",
    ) as NodeJS.ErrnoException;
    permError.code = "EACCES";
    vi.mocked(readFile).mockRejectedValue(permError);

    await expect(getSkillDetail("skill-a", "/workspace")).rejects.toThrow(
      "EACCES",
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "skill_detail_error" }),
    );
  });
});
