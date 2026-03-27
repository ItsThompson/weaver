import "../../__test-helpers__/mock-fs";
import "../../__test-helpers__/mock-child-process";

vi.mock("../../config/index", () => ({
  readProjectConfig: vi.fn(),
  resolveTestRunners: vi.fn<() => string[]>(),
  findNearestConfig: vi.fn(),
  groupFilesByConfig: vi.fn(),
}));

vi.mock("../../session-analysis", () => ({
  extractChangedFiles: vi.fn<() => string[]>(),
  extractAgentTestedDirs: vi.fn<() => string[]>(),
  isWithinDir: vi.fn<() => boolean>(),
}));

vi.mock("../../scope/index", () => ({
  resolveTestDirs: vi.fn<() => string[]>(),
}));

import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import type { WeaverProjectConfig } from "@weaver/shared/types";
import type { ValidateArgs } from "./parse-args";
import { groupFilesByConfig, resolveTestRunners } from "../../config/index";
import {
  extractChangedFiles,
  extractAgentTestedDirs,
} from "../../session-analysis";
import { spawnResult } from "../../__test-helpers__/spawn";
import { runStopTrigger } from "./stop-trigger";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
  vi.mocked(resolveTestRunners).mockReturnValue(["jest"]);
  vi.mocked(extractAgentTestedDirs).mockReturnValue([]);
});

function makeGroups(
  entries: [string, { config: WeaverProjectConfig; files: string[] }][],
): Map<string, { config: WeaverProjectConfig; files: string[] }> {
  return new Map(entries);
}

const args: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "stop",
};

describe("runStopTrigger", () => {
  it("exits 0 when no changed files", () => {
    vi.mocked(extractChangedFiles).mockReturnValue([]);
    expect(runStopTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("exits 0 when no config groups found", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/outside/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(new Map());
    expect(runStopTrigger(args, "/logs/sess-1.jsonl").exitCode).toBe(0);
  });

  it("runs hooks and writes validation event", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: { stop: [{ name: "lint", command: "eslint ." }] },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const result = runStopTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(0);
    expect(appendFileSync).toHaveBeenCalledWith(
      "/logs/sess-1.jsonl",
      expect.stringContaining('"hook_event_name":"validation"'),
    );
  });

  it("returns exit 1 when hooks fail", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
      makeGroups([
        [
          "/project",
          {
            config: {
              validation: { stop: [{ name: "tsc", command: "tsc" }] },
            },
            files: ["/project/a.ts"],
          },
        ],
      ]),
    );
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({ status: 1, stderr: "error" }),
    );

    const result = runStopTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("1/1 validations failed (tsc)");
  });

  it("runs each config group independently", () => {
    vi.mocked(extractChangedFiles).mockReturnValue([
      "/mono/pkg-a/x.ts",
      "/mono/pkg-b/y.ts",
    ]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
      makeGroups([
        [
          "/mono/pkg-a",
          {
            config: {
              validation: { stop: [{ name: "lint-a", command: "eslint ." }] },
            },
            files: ["/mono/pkg-a/x.ts"],
          },
        ],
        [
          "/mono/pkg-b",
          {
            config: {
              validation: { stop: [{ name: "lint-b", command: "eslint ." }] },
            },
            files: ["/mono/pkg-b/y.ts"],
          },
        ],
      ]),
    );
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    runStopTrigger({ ...args, cwd: "/mono" }, "/logs/sess-1.jsonl");
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(appendFileSync).toHaveBeenCalledTimes(2);
  });

  it("skips groups with no stop hooks", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
      makeGroups([
        ["/project", { config: { validation: {} }, files: ["/project/a.ts"] }],
      ]),
    );

    const result = runStopTrigger(args, "/logs/sess-1.jsonl");
    expect(result.exitCode).toBe(0);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
