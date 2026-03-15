import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/skill-resolver";

import { readFile } from "node:fs/promises";
import { kiroSearchPaths } from "../skill-resolver/kiro-paths";
import { log } from "../../utils/logger";
import { getSkillDetail } from "./get-skill-detail";
import {
  SKILL_BASIC_CONTENT,
  SEARCH_PATHS,
} from "../../__tests__/fixtures/skills";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(kiroSearchPaths).mockReturnValue([...SEARCH_PATHS]);
});

describe("getSkillDetail", () => {
  it("returns parsed frontmatter and body for existing skill", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a", "/workspace");

    expect(detail).toEqual({
      frontmatter: { name: "skill-a", description: "Skill A description" },
      body: expect.stringContaining("Body of skill A"),
      source: "workspace",
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
