import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";
import "../../__tests__/mocks/config";

vi.mock("../skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { readConfig } from "../config/index";
import { log } from "../../utils/logger";
import { getSkillDetail } from "./get-skill-detail";
import { DEFAULT_CONFIG } from "@weaver/shared/types";
import { SKILL_BASIC_CONTENT } from "../../__tests__/fixtures/skills";

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

describe("getSkillDetail", () => {
  it("returns parsed frontmatter, body, and project for existing skill", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a");

    expect(detail).toEqual({
      frontmatter: { name: "skill-a", description: "Skill A description" },
      body: expect.stringContaining("Body of skill A"),
      source: "workspace",
      category: null,
      project: "my-app",
    });
  });

  it("returns null project for global skills", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: { ...DEFAULT_CONFIG, skill_paths: [] },
      warnings: [],
      fieldErrors: {},
    });
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a");

    expect(detail?.project).toBeNull();
    expect(detail?.source).toBe("global");
  });

  it("resolves category from config", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: {
        ...DEFAULT_CONFIG,
        skill_paths: ["/projects/my-app/.kiro/skills"],
        skill_graph: { categories: { core: { skills: ["skill-a"] } } },
      },
      warnings: [],
      fieldErrors: {},
    });
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a");

    expect(detail?.category).toBe("core");
  });

  it("resolves category from frontmatter when not in config", async () => {
    const content = `---\nname: skill-a\ndescription: desc\ncategory: workflow\n---\nBody`;
    vi.mocked(readFile).mockResolvedValue(content);

    const detail = await getSkillDetail("skill-a");

    expect(detail?.category).toBe("workflow");
  });

  it("source=global selects global variant", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a", { source: "global" });

    expect(detail?.source).toBe("global");
    expect(detail?.project).toBeNull();
  });

  it("project option selects workspace variant by project name", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a", { project: "my-app" });

    expect(detail?.source).toBe("workspace");
    expect(detail?.project).toBe("my-app");
  });

  it("no options returns first match", async () => {
    vi.mocked(readFile).mockResolvedValue(SKILL_BASIC_CONTENT);

    const detail = await getSkillDetail("skill-a");

    expect(detail?.source).toBe("workspace");
  });

  it("returns null for nonexistent skill", async () => {
    const enoent = new Error("ENOENT") as NodeJS.ErrnoException;
    enoent.code = "ENOENT";
    vi.mocked(readFile).mockRejectedValue(enoent);

    const detail = await getSkillDetail("nonexistent");

    expect(detail).toBeNull();
  });

  it("rejects path traversal attempts", async () => {
    const detail = await getSkillDetail("../../etc");

    expect(detail).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects skill names with invalid characters", async () => {
    const detail = await getSkillDetail("skill/name");

    expect(detail).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rethrows non-ENOENT errors", async () => {
    const permError = new Error(
      "EACCES: permission denied",
    ) as NodeJS.ErrnoException;
    permError.code = "EACCES";
    vi.mocked(readFile).mockRejectedValue(permError);

    await expect(getSkillDetail("skill-a")).rejects.toThrow("EACCES");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "skill_detail_error" }),
    );
  });
});
