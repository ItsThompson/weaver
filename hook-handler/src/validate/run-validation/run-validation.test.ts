import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";
import type { WeaverProjectConfig } from "@weaver/shared/types";
import type { ValidateArgs } from "./parse-args";
import {
  mockFs,
  mockChildProcess,
  mockValidateDeps,
} from "../../__test-helpers__/index";

const { appendFileSync, writeFileSync } = await mockFs();
const { spawnSync } = await mockChildProcess();
const {
  findNearestConfig: mockFindNearestConfig,
  groupFilesByConfig: mockGroupFilesByConfig,
  resolveTestRunners: mockResolveTestRunners,
  extractChangedFiles: mockExtractChangedFiles,
  extractAgentTestedDirs: mockExtractAgentTestedDirs,
} = await mockValidateDeps("../..");

const { runValidation } = await import("./run-validation");

let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response());
  globalThis.fetch = mockFetch;
  mockResolveTestRunners.mockReturnValue(["jest", "vitest", "npm test"]);
  mockExtractAgentTestedDirs.mockReturnValue([]);
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

function makeGroups(
  entries: [string, { config: WeaverProjectConfig; files: string[] }][],
): Map<string, { config: WeaverProjectConfig; files: string[] }> {
  return new Map(entries);
}

const stopArgs: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "stop",
};
const postToolArgs: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "postToolUse",
  toolName: "fs_write",
};

describe("runValidation - stop trigger", () => {
  it("exits 0 when no changed files", () => {
    mockExtractChangedFiles.mockReturnValue([]);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("exits 0 when no config groups found", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(new Map());
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("runs all hooks and collects results", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/src/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: {
                stop: [
                  { name: "typecheck", command: "npx tsc --noEmit" },
                  { name: "lint", command: "npx eslint ." },
                ],
              },
            },
            files: ["/project/src/a.ts"],
          },
        ],
      ]),
    );
    spawnSync.mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(result.exitCode).toBe(0);
  });

  it("all pass → exit 0, no pending file", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: { stop: [{ name: "ok", command: "echo ok" }] },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    spawnSync.mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(result.exitCode).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("some fail → exit 1, pending file written, STDERR summary", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: {
                stop: [
                  { name: "typecheck", command: "tsc" },
                  { name: "lint", command: "eslint ." },
                  { name: "test", command: "jest" },
                ],
              },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    spawnSync
      .mockReturnValueOnce(spawnResult({ status: 1, stderr: "type error" }))
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(spawnResult({ status: 1, stderr: "test fail" }));

    const result = runValidation(stopArgs);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("2/3 validations failed (typecheck, test)");
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("sess-1.pending"),
      expect.any(String),
    );
  });

  it("appends validation event to session log", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: { stop: [{ name: "check", command: "echo ok" }] },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    spawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("sess-1.jsonl"),
      expect.stringContaining('"hook_event_name":"validation"'),
    );
  });

  it("notifies server after appending validation event", () => {
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockGroupFilesByConfig.mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: { stop: [{ name: "check", command: "echo ok" }] },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    spawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8143/api/notify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "sess-1", eventName: "validation" }),
      }),
    );
  });
});

describe("runValidation - postToolUse trigger", () => {
  it("exits 0 when no config found", () => {
    mockFindNearestConfig.mockReturnValue(null);
    expect(runValidation(postToolArgs).exitCode).toBe(0);
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
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });

  it("matcher filters correctly", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            {
              matcher: "fs_write",
              name: "format",
              command: "prettier --write {{file}}",
            },
            { matcher: "execute_bash", name: "other", command: "echo" },
          ],
        },
      },
      configRoot: "/project",
    });
    spawnSync.mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolPath: "/project/src/a.ts" });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier --write /project/src/a.ts",
      expect.objectContaining({ shell: true }),
    );
  });

  it("substitutes {{file}} from toolPath", () => {
    mockFindNearestConfig.mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "fs_write", name: "fmt", command: "prettier {{file}}" },
          ],
        },
      },
      configRoot: "/project",
    });
    spawnSync.mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolPath: "/project/x.ts" });
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier /project/x.ts",
      expect.objectContaining({ shell: true }),
    );
  });
});

describe("runValidation - no config", () => {
  it("exits 0 when no changed files for stop", () => {
    mockExtractChangedFiles.mockReturnValue([]);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("exits 0 when no config found for postToolUse", () => {
    mockFindNearestConfig.mockReturnValue(null);
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });
});
