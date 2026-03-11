import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";
import type { ValidateArgs } from "./parse-args";
import {
  mockFs,
  mockChildProcess,
  mockValidateDeps,
} from "../../__test-helpers__/index";

const { appendFileSync, writeFileSync } = await mockFs();
const { spawnSync } = await mockChildProcess();
const {
  readProjectConfig: mockReadProjectConfig,
  resolveTestRunners: mockResolveTestRunners,
  extractChangedFiles: mockExtractChangedFiles,
  extractAgentTestedDirs: mockExtractAgentTestedDirs,
} = await mockValidateDeps("../..");

const { runStopTrigger } = await import("./stop-trigger");

let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response());
  globalThis.fetch = mockFetch;
  mockResolveTestRunners.mockReturnValue(["jest"]);
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
  trigger: "stop",
};

describe("runStopTrigger", () => {
  it("exits 0 when no config", () => {
    mockReadProjectConfig.mockReturnValue(null);
    expect(runStopTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("exits 0 when no stop hooks", () => {
    mockReadProjectConfig.mockReturnValue({ validation: {} });
    expect(runStopTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("runs hooks and writes validation event", () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: "lint", command: "eslint ." }] },
    });
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    spawnSync.mockReturnValue(spawnResult());

    const result = runStopTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(0);
    expect(appendFileSync).toHaveBeenCalledWith(
      "/logs/sess-1.jsonl",
      expect.stringContaining('"hook_event_name":"validation"'),
    );
  });

  it("returns exit 1 when hooks fail", () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: "tsc", command: "tsc" }] },
    });
    mockExtractChangedFiles.mockReturnValue(["/project/a.ts"]);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    spawnSync.mockReturnValue(spawnResult({ status: 1, stderr: "error" }));

    const result = runStopTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("1/1 validations failed (tsc)");
  });
});
