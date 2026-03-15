import { isWithinDir } from "./path-utils";

describe("isWithinDir", () => {
  it.each([
    ["/project/src/a.ts", "/project", true, "file inside dir"],
    ["/project/a.ts", "/project", true, "file at dir root"],
    ["/project/a/b/c.ts", "/project", true, "deeply nested file"],
    ["/other/a.ts", "/project", false, "file outside dir"],
    [
      "/project-other/file.ts",
      "/project",
      false,
      "similar prefix, not a parent",
    ],
    ["/a.ts", "/project/sub", false, "parent directory file"],
  ])("%s in %s → %s (%s)", (filePath, dir, expected) => {
    expect(isWithinDir(filePath, dir)).toBe(expected);
  });
});
