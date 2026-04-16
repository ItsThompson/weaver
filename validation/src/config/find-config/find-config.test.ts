vi.mock("../project-config", () => ({
  readProjectConfig:
    vi.fn<
      (cwd: string) => import("@weaver/shared/types").WeaverProjectConfig | null
    >(),
}));

import type { WeaverProjectConfig } from "@weaver/shared/types";
import { readProjectConfig } from "../project-config";
import { findNearestConfig, groupFilesByConfig } from "./find-config";

const config: WeaverProjectConfig = {
  validation: { stop: [{ name: "lint", command: "eslint ." }] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findNearestConfig", () => {
  it("returns config when found in starting directory", () => {
    vi.mocked(readProjectConfig).mockReturnValue(config);
    const result = findNearestConfig("/project");
    expect(result).toEqual({ config, configRoot: "/project" });
    expect(readProjectConfig).toHaveBeenCalledWith("/project");
  });

  it("walks up and returns config from ancestor", () => {
    vi.mocked(readProjectConfig).mockImplementation((dir) =>
      dir === "/project" ? config : null,
    );
    const result = findNearestConfig("/project/src/deep");
    expect(result).toEqual({ config, configRoot: "/project" });
  });

  it("returns null when no config found anywhere", () => {
    vi.mocked(readProjectConfig).mockReturnValue(null);
    const result = findNearestConfig("/a/b/c");
    expect(result).toBeNull();
  });
});

describe("groupFilesByConfig", () => {
  it("groups files by their nearest config root", () => {
    const configA: WeaverProjectConfig = {
      validation: { stop: [{ name: "a", command: "echo a" }] },
    };
    const configB: WeaverProjectConfig = {
      validation: { stop: [{ name: "b", command: "echo b" }] },
    };
    vi.mocked(readProjectConfig).mockImplementation((dir) => {
      if (dir === "/mono/pkg-a") {
        return configA;
      }
      if (dir === "/mono/pkg-b") {
        return configB;
      }
      return null;
    });

    const groups = groupFilesByConfig([
      "/mono/pkg-a/src/x.ts",
      "/mono/pkg-b/src/y.ts",
      "/mono/pkg-a/src/z.ts",
    ]);

    expect(groups.size).toBe(2);
    expect(groups.get("/mono/pkg-a")!.files).toEqual([
      "/mono/pkg-a/src/x.ts",
      "/mono/pkg-a/src/z.ts",
    ]);
    expect(groups.get("/mono/pkg-a")!.config).toBe(configA);
    expect(groups.get("/mono/pkg-b")!.files).toEqual(["/mono/pkg-b/src/y.ts"]);
  });

  it("excludes files with no config ancestor", () => {
    vi.mocked(readProjectConfig).mockReturnValue(null);
    const groups = groupFilesByConfig(["/outside/file.ts"]);
    expect(groups.size).toBe(0);
  });

  it("handles mix of config and no-config files", () => {
    vi.mocked(readProjectConfig).mockImplementation((dir) =>
      dir === "/project" ? config : null,
    );
    const groups = groupFilesByConfig(["/project/src/a.ts", "/outside/b.ts"]);
    expect(groups.size).toBe(1);
    expect(groups.get("/project")!.files).toEqual(["/project/src/a.ts"]);
  });
});
