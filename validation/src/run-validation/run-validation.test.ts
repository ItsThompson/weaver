import "../__test-helpers__/mock-fs";
import "../__test-helpers__/mock-child-process";

vi.mock("../config/index", () => ({
  readProjectConfig: vi.fn(),
  resolveTestRunners: vi.fn<() => string[]>(),
  findNearestConfig: vi.fn(),
  groupFilesByConfig: vi.fn(),
}));

vi.mock("../session-analysis", () => ({
  extractChangedFiles: vi.fn<() => string[]>(),
  extractAgentTestedDirs: vi.fn<() => string[]>(),
  isWithinDir: vi.fn<() => boolean>(),
}));

vi.mock("../scope/index", () => ({
  resolveTestDirs: vi.fn<() => string[]>(),
}));

import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { Harness } from "@weaver/shared/types";
import type { WeaverProjectConfig } from "@weaver/shared/types";
import type { ValidateArgs } from "./parse-args";
import {
  findNearestConfig,
  groupFilesByConfig,
  resolveTestRunners,
} from "../config/index";
import {
  extractChangedFiles,
  extractAgentTestedDirs,
} from "../session-analysis";
import { spawnResult } from "../__test-helpers__/spawn";
import { runValidation } from "./run-validation";

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch = vi.fn().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch as typeof globalThis.fetch;
  vi.mocked(resolveTestRunners).mockReturnValue(["jest", "vitest", "npm test"]);
  vi.mocked(extractAgentTestedDirs).mockReturnValue([]);
});

function makeGroups(
  entries: [string, { config: WeaverProjectConfig; files: string[] }][],
): Map<string, { config: WeaverProjectConfig; files: string[] }> {
  return new Map(entries);
}

const stopArgs: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "stop",
  harness: Harness.KIRO_CLI,
};
const postToolArgs: ValidateArgs = {
  sessionId: "sess-1",
  cwd: "/project",
  trigger: "postToolUse",
  harness: Harness.KIRO_CLI,
  toolName: "fs_write",
};

describe("runValidation - stop trigger", () => {
  it("exits 0 when no changed files", () => {
    vi.mocked(extractChangedFiles).mockReturnValue([]);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("exits 0 when no config groups found", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(new Map());
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("runs all hooks and collects results", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/src/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(result.exitCode).toBe(0);
  });

  it("all pass → exit 0, no pending file", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(result.exitCode).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("some fail → exit 1, pending file written, STDERR summary", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
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
    vi.mocked(spawnSync)
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
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("sess-1.jsonl"),
      expect.stringContaining('"eventName":"validation"'),
    );
  });

  it("notifies server after appending validation event", () => {
    vi.mocked(extractChangedFiles).mockReturnValue(["/project/a.ts"]);
    vi.mocked(groupFilesByConfig).mockReturnValue(
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

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
    vi.mocked(findNearestConfig).mockReturnValue(null);
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });

  it("exits 0 when no matching hooks", () => {
    vi.mocked(findNearestConfig).mockReturnValue({
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
    vi.mocked(findNearestConfig).mockReturnValue({
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolPath: "/project/src/a.ts" });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier --write /project/src/a.ts",
      expect.objectContaining({ shell: true }),
    );
  });

  it("substitutes {{file}} from toolPath", () => {
    vi.mocked(findNearestConfig).mockReturnValue({
      config: {
        validation: {
          postToolUse: [
            { matcher: "fs_write", name: "fmt", command: "prettier {{file}}" },
          ],
        },
      },
      configRoot: "/project",
    });
    vi.mocked(spawnSync).mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolPath: "/project/x.ts" });
    expect(spawnSync).toHaveBeenCalledWith(
      "prettier /project/x.ts",
      expect.objectContaining({ shell: true }),
    );
  });
});

describe("runValidation - no config", () => {
  it("exits 0 when no changed files for stop", () => {
    vi.mocked(extractChangedFiles).mockReturnValue([]);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it("exits 0 when no config found for postToolUse", () => {
    vi.mocked(findNearestConfig).mockReturnValue(null);
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });
});
