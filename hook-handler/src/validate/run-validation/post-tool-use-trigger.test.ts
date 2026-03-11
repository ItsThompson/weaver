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
const { readProjectConfig: mockReadProjectConfig } =
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
  it("exits 0 when no config", () => {
    mockReadProjectConfig.mockReturnValue(null);
    expect(runPostToolUseTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("exits 0 when no matching hooks", () => {
    mockReadProjectConfig.mockReturnValue({
      validation: {
        postToolUse: [
          { matcher: "execute_bash", name: "fmt", command: "echo" },
        ],
      },
    });
    expect(runPostToolUseTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("runs matching hooks with file substitution", () => {
    mockReadProjectConfig.mockReturnValue({
      validation: {
        postToolUse: [
          {
            matcher: "fs_write",
            name: "format",
            command: "prettier --write {{file}}",
          },
        ],
      },
    });
    spawnSync.mockReturnValue(spawnResult());

    const result = runPostToolUseTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier --write /project/a.ts",
      expect.objectContaining({ shell: true }),
    );
  });

  it("writes validation event after running hooks", () => {
    mockReadProjectConfig.mockReturnValue({
      validation: {
        postToolUse: [
          { matcher: "fs_write", name: "fmt", command: "echo {{file}}" },
        ],
      },
    });
    spawnSync.mockReturnValue(spawnResult());

    runPostToolUseTrigger(args, "/logs/sess-1.jsonl");
    expect(appendFileSync).toHaveBeenCalledWith(
      "/logs/sess-1.jsonl",
      expect.stringContaining('"trigger":"postToolUse"'),
    );
  });
});
