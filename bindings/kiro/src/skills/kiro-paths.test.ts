import { homedir } from "node:os";
import { join } from "node:path";
import { kiroSearchPaths } from "./kiro-paths";

describe("kiroSearchPaths", () => {
  it("returns workspace and global paths", () => {
    expect(kiroSearchPaths("/project", "skills")).toEqual([
      join("/project", ".kiro", "skills"),
      join(homedir(), ".kiro", "skills"),
    ]);
  });

  it("supports nested segments", () => {
    expect(kiroSearchPaths("/project", "agents", "dev.json")).toEqual([
      join("/project", ".kiro", "agents", "dev.json"),
      join(homedir(), ".kiro", "agents", "dev.json"),
    ]);
  });
});
