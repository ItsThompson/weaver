import { stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { validatePathsExist } from "./validate-paths";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

const globalSkillsPath = resolve(join(homedir(), ".kiro", "skills"));

beforeEach(() => vi.clearAllMocks());

describe("validatePathsExist", () => {
  it("returns empty array for valid directories", async () => {
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);

    const errors = await validatePathsExist(["/path/a", "/path/b"]);

    expect(errors).toEqual([]);
  });

  it("returns error for nonexistent paths", async () => {
    vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));

    const errors = await validatePathsExist(["/nonexistent"]);

    expect(errors).toEqual(["/nonexistent: path does not exist"]);
  });

  it("returns error for paths that are files", async () => {
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);

    const errors = await validatePathsExist(["/some/file.txt"]);

    expect(errors).toEqual(["/some/file.txt: path is not a directory"]);
  });

  it("expands tilde in paths", async () => {
    vi.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);

    await validatePathsExist(["~/projects/my-app"]);

    const expected = resolve(join(homedir(), "projects/my-app"));
    expect(stat).toHaveBeenCalledWith(expected);
  });

  it("rejects ~/.kiro/skills as reserved for global skills", async () => {
    const errors = await validatePathsExist(["~/.kiro/skills"]);

    expect(errors).toEqual([
      expect.stringContaining("reserved for global skills"),
    ]);
  });

  it("rejects resolved form of ~/.kiro/skills", async () => {
    const errors = await validatePathsExist([globalSkillsPath]);

    expect(errors).toEqual([
      expect.stringContaining("reserved for global skills"),
    ]);
  });

  it("rejects duplicate paths", async () => {
    const errors = await validatePathsExist(["/path/a", "/path/a"]);

    expect(errors).toEqual([expect.stringContaining("Duplicate path")]);
  });

  it("rejects duplicates that differ only in trailing slash", async () => {
    const errors = await validatePathsExist(["/path/a", "/path/a/"]);

    expect(errors).toEqual([expect.stringContaining("Duplicate path")]);
  });

  it("rejects duplicates with tilde vs expanded form", async () => {
    const expanded = resolve(join(homedir(), "projects"));
    const errors = await validatePathsExist(["~/projects", expanded]);

    expect(errors).toEqual([expect.stringContaining("Duplicate path")]);
  });

  it("returns multiple errors for multiple invalid paths", async () => {
    vi.mocked(stat)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce({ isDirectory: () => false } as any);

    const errors = await validatePathsExist(["/missing", "/file.txt"]);

    expect(errors).toHaveLength(2);
  });
});
