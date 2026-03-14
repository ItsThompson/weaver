import { describe, it, expect } from "@jest/globals";
import { isWithinDir } from "./path-utils";

describe("isWithinDir", () => {
  it("returns true for file inside dir", () => {
    expect(isWithinDir("/project/src/a.ts", "/project")).toBe(true);
  });

  it("returns true for file at dir root", () => {
    expect(isWithinDir("/project/a.ts", "/project")).toBe(true);
  });

  it("returns true for deeply nested file", () => {
    expect(isWithinDir("/project/a/b/c.ts", "/project")).toBe(true);
  });

  it("returns false for file outside dir", () => {
    expect(isWithinDir("/other/a.ts", "/project")).toBe(false);
  });

  it("returns false for similar path prefix that is not a parent", () => {
    expect(isWithinDir("/project-other/file.ts", "/project")).toBe(false);
  });

  it("returns false for parent directory file", () => {
    expect(isWithinDir("/a.ts", "/project/sub")).toBe(false);
  });
});
