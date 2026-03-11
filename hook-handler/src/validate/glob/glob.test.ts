import { describe, it, expect } from "@jest/globals";
import { matchesExtensionGlob } from "./glob";

const files = ["/a.ts", "/b.tsx", "/c.py", "/d.md", "/e.ts"];

describe("matchesExtensionGlob", () => {
  it("matches brace pattern", () => {
    expect(matchesExtensionGlob(files, "**/*.{ts,tsx}")).toEqual([
      "/a.ts",
      "/b.tsx",
      "/e.ts",
    ]);
  });

  it("matches single extension pattern", () => {
    expect(matchesExtensionGlob(files, "*.py")).toEqual(["/c.py"]);
  });

  it("returns all files for unrecognized pattern", () => {
    expect(matchesExtensionGlob(files, "src/**")).toEqual(files);
  });

  it("returns empty for no matches", () => {
    expect(matchesExtensionGlob(files, "**/*.rs")).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(matchesExtensionGlob([], "**/*.ts")).toEqual([]);
  });
});
