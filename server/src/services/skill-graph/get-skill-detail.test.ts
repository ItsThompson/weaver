import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { log } from "../../utils/logger";
import { SKILL_BASIC_CONTENT } from "../../__tests__/fixtures/skills";
import { getSkillDetail } from "./get-skill-detail";

const globalPath = resolve(join(homedir(), ".kiro", "skills"));

beforeEach(() => vi.clearAllMocks());

describe("getSkillDetail", () => {
  it("returns parsed skill with project from configured path", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail(
      "skill-a",
      ["/projects/my-app/.kiro/skills"],
      {},
    );

    expect(detail).toMatchObject({
      source: "workspace",
      project: "my-app",
      category: null,
    });
    expect(detail?.frontmatter.name).toBe("skill-a");
  });

  it("returns global skill with project null", async () => {
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (String(path).startsWith(globalPath)) {
        return SKILL_BASIC_CONTENT;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const detail = await getSkillDetail("skill-a", [], {});

    expect(detail).toMatchObject({
      source: "global",
      project: null,
    });
  });

  it("filters by project when provided", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail(
      "skill-a",
      ["/projects/my-app/.kiro/skills", "/projects/other/.kiro/skills"],
      {},
      "my-app",
    );

    expect(detail?.project).toBe("my-app");
  });

  it("filters by source=global", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail(
      "skill-a",
      ["/projects/my-app/.kiro/skills"],
      {},
      undefined,
      "global",
    );

    expect(detail?.source).toBe("global");
    expect(detail?.project).toBeNull();
  });

  it("falls back to first match when no project or source", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail(
      "skill-a",
      ["/projects/my-app/.kiro/skills"],
      {},
    );

    expect(detail).not.toBeNull();
    expect(detail?.project).toBe("my-app");
  });

  it("resolves category from config", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail(
      "skill-a",
      ["/projects/my-app/.kiro/skills"],
      { core: { skills: ["skill-a"] } },
    );

    expect(detail?.category).toBe("core");
  });

  it("returns null for nonexistent skill", async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    const detail = await getSkillDetail("nonexistent", [], {});

    expect(detail).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const detail = await getSkillDetail("../../etc", [], {});

    expect(detail).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rethrows non-ENOENT errors", async () => {
    vi.mocked(readFile).mockRejectedValue(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );

    await expect(
      getSkillDetail("skill-a", ["/projects/my-app/.kiro/skills"], {}),
    ).rejects.toThrow("EACCES");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "skill_detail_error" }),
    );
  });
});
