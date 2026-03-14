import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";
import { mockChildProcess } from "../../__test-helpers__/index";

const { spawnSync } = await mockChildProcess();

jest.unstable_mockModule("../../scope/index", () => ({
  resolveTestDirs: jest.fn<() => string[]>(),
}));

const scope = await import("../../scope/index");
const mockResolveTestDirs = scope.resolveTestDirs as jest.MockedFunction<
  typeof scope.resolveTestDirs
>;

const { runStopHook } = await import("./stop-hook");

beforeEach(() => {
  jest.clearAllMocks();
});

function spawnResult(
  overrides: Partial<SpawnSyncReturns<string>> = {},
): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  } as SpawnSyncReturns<string>;
}

describe("runStopHook", () => {
  it("substitutes {{files}} correctly", () => {
    spawnSync.mockReturnValue(spawnResult());

    runStopHook(
      { name: "lint", command: "eslint {{files}}" },
      ["/project/a.ts", "/project/b.ts"],
      [],
      "/project",
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "eslint /project/a.ts /project/b.ts",
      expect.objectContaining({ shell: true }),
    );
  });

  it("substitutes {{test_dirs}} with scope-derived dirs", () => {
    spawnSync.mockReturnValue(spawnResult());
    mockResolveTestDirs.mockReturnValue(["src"]);

    runStopHook(
      { name: "test", command: "jest {{test_dirs}}", scope: "parent" },
      ["/project/src/a.ts"],
      [],
      "/project",
    );
    expect(mockResolveTestDirs).toHaveBeenCalledWith(
      ["/project/src/a.ts"],
      "parent",
      "/project",
      [],
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "jest src",
      expect.objectContaining({ shell: true }),
    );
  });

  it("skips when run_if_files_match has no matches", () => {
    const result = runStopHook(
      {
        name: "lint",
        command: "eslint {{files}}",
        run_if_files_match: "**/*.{ts,tsx}",
      },
      ["/project/readme.md"],
      [],
      "/project",
    );
    expect(spawnSync).not.toHaveBeenCalled();
    expect(result.skipped_reason).toBe("no files matched run_if_files_match");
  });

  it("skips when {{files}} is empty", () => {
    const result = runStopHook(
      { name: "lint", command: "eslint {{files}}" },
      [],
      [],
      "/project",
    );
    expect(spawnSync).not.toHaveBeenCalled();
    expect(result.skipped_reason).toBe("no changed files");
  });

  it("skips when {{test_dirs}} empty after dedup", () => {
    mockResolveTestDirs.mockReturnValue([]);

    const result = runStopHook(
      { name: "test", command: "jest {{test_dirs}}", scope: "parent" },
      ["/project/src/a.ts"],
      ["src"],
      "/project",
    );
    expect(spawnSync).not.toHaveBeenCalled();
    expect(result.skipped_reason).toBe("no test dirs after deduplication");
  });

  it("marks timed_out when process is killed", () => {
    spawnSync.mockReturnValue(
      spawnResult({
        status: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "killed",
      }),
    );

    const result = runStopHook(
      { name: "slow", command: "sleep 999", timeout_ms: 100 },
      ["/project/a.ts"],
      [],
      "/project",
    );
    expect(result.timed_out).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("truncates output at MAX_OUTPUT_LENGTH", () => {
    spawnSync.mockReturnValue(spawnResult({ stdout: "x".repeat(10_000) }));

    const result = runStopHook(
      { name: "verbose", command: "echo lots" },
      ["/project/a.ts"],
      [],
      "/project",
    );
    expect(result.output.length).toBe(5_000);
  });

  it("defaults hook_type to check when type is omitted", () => {
    spawnSync.mockReturnValue(spawnResult());

    const result = runStopHook(
      { name: "lint", command: "eslint ." },
      ["/project/a.ts"],
      [],
      "/project",
    );
    expect(result.hook_type).toBe("check");
  });

  it("sets hook_type to test when type is test", () => {
    spawnSync.mockReturnValue(spawnResult());

    const result = runStopHook(
      { name: "test", command: "jest .", type: "test" },
      ["/project/a.ts"],
      [],
      "/project",
    );
    expect(result.hook_type).toBe("test");
  });

  it("passes tailBiased true to runCommand for test hooks", () => {
    spawnSync.mockReturnValue(spawnResult());

    runStopHook(
      { name: "test", command: "jest .", type: "test" },
      ["/project/a.ts"],
      [],
      "/project",
    );
    expect(spawnSync).toHaveBeenCalled();
  });

  it("sets hook_type on skipped results", () => {
    const result = runStopHook(
      { name: "lint", command: "eslint {{files}}", type: "test" },
      [],
      [],
      "/project",
    );
    expect(result.hook_type).toBe("test");
    expect(result.skipped_reason).toBe("no changed files");
  });
});
