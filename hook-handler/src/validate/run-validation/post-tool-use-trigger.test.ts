import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";
import type { ValidateArgs } from "./parse-args";
import {
  mockFs,
  mockChildProcess,
  mockValidateDeps,
} from "../../__test-helpers__/index";

const { appendFileSync } = await mockFs();
const { spawnSync } = await mockChildProcess();
const { findNearestConfig: mockFindNearestConfig } =
  await mockValidateDeps("../..");

const { runPostToolUseTrigger } = await import("./post-tool-use-trigger");

let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response());
  globalThis.fetch = mockFetch;
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

const args: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "postToolUse",
  toolName: "fs_write",
  toolPath: "/project/a.ts",
};

describe("runPostToolUseTrigger", () => {
  it("exits 0 when no config found", () => {
    mockFindNearestConfig.mockReturnValue(null);
    expect(runPostToolUseTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("exits 0 when no matching hooks", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "execute_bash", name: "fmt", command: "echo" },
          ],
        },
      },
      configRoot: "/project",
    });
    expect(runPostToolUseTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("runs matching hooks with file substitution", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            {
              matcher: "fs_write",
              name: "format",
              command: "prettier --write {{file}}",
            },
          ],
        },
      },
      configRoot: "/project",
    });
    spawnSync.mockReturnValue(spawnResult());

    const result = runPostToolUseTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier --write /project/a.ts",
      expect.objectContaining({ shell: true, cwd: "/project" }),
    );
  });

  it("writes validation event after running hooks", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "fs_write", name: "fmt", command: "echo {{file}}" },
          ],
        },
      },
      configRoot: "/project",
    });
    spawnSync.mockReturnValue(spawnResult());

    runPostToolUseTrigger(args, "/logs/sess-1.jsonl");
    expect(appendFileSync).toHaveBeenCalledWith(
      "/logs/sess-1.jsonl",
      expect.stringContaining('"trigger":"postToolUse"'),
    );
  });

  it("uses configRoot as cwd for hook execution", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "fs_write", name: "fmt", command: "echo {{file}}" },
          ],
        },
      },
      configRoot: "/mono/pkg-a",
    });
    spawnSync.mockReturnValue(spawnResult());

    runPostToolUseTrigger(
      { ...args, toolPath: "/mono/pkg-a/src/x.ts" },
      "/logs/sess-1.jsonl",
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "echo /mono/pkg-a/src/x.ts",
      expect.objectContaining({ cwd: "/mono/pkg-a" }),
    );
  });

  it("falls back to args.cwd when toolPath is empty", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "fs_write", name: "fmt", command: "echo hi" },
          ],
        },
      },
      configRoot: "/project",
    });
    spawnSync.mockReturnValue(spawnResult());

    runPostToolUseTrigger({ ...args, toolPath: "" }, "/logs/sess-1.jsonl");
    expect(mockFindNearestConfig).toHaveBeenCalledWith("/project");
  });

  it("exits 0 when no config at cwd for non-file event", () => {
    mockFindNearestConfig.mockReturnValue(null);
    const result = runPostToolUseTrigger(
      { ...args, toolPath: "" },
      "/logs/sess-1.jsonl",
    );
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
