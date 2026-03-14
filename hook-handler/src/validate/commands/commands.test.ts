import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";
import { mockChildProcess } from "../../__test-helpers__/index";

const { spawnSync } = await mockChildProcess();

const { substituteVars, commandUsesVar, runCommand } =
  await import("./commands");

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

describe("substituteVars", () => {
  it("replaces single variable", () => {
    expect(substituteVars("echo {{file}}", { file: "a.ts" })).toBe("echo a.ts");
  });

  it("replaces multiple variables", () => {
    expect(
      substituteVars("lint {{files}} --out {{dir}}", {
        files: "a.ts b.ts",
        dir: "out",
      }),
    ).toBe("lint a.ts b.ts --out out");
  });

  it("leaves command unchanged when no vars match", () => {
    expect(substituteVars("echo hello", { file: "a.ts" })).toBe("echo hello");
  });
});

describe("commandUsesVar", () => {
  it("returns true when variable present", () => {
    expect(commandUsesVar("jest {{test_dirs}}", "test_dirs")).toBe(true);
  });

  it("returns false when variable absent", () => {
    expect(commandUsesVar("jest .", "test_dirs")).toBe(false);
  });
});

describe("runCommand", () => {
  it("returns output and exit code", () => {
    spawnSync.mockReturnValue(
      spawnResult({ status: 0, stdout: "ok", stderr: "" }),
    );
    const result = runCommand("echo ok", "/project", 5000);
    expect(result.output).toBe("ok");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("detects SIGTERM timeout", () => {
    spawnSync.mockReturnValue(spawnResult({ status: null, signal: "SIGTERM" }));
    const result = runCommand("sleep 999", "/project", 100);
    expect(result.timedOut).toBe(true);
  });

  it("truncates output at MAX_OUTPUT_LENGTH", () => {
    spawnSync.mockReturnValue(spawnResult({ stdout: "x".repeat(10_000) }));
    const result = runCommand("echo lots", "/project", 5000);
    expect(result.output.length).toBe(5_000);
  });

  it("keeps tail when tailBiased is true", () => {
    const tail = "y".repeat(5_000);
    spawnSync.mockReturnValue(
      spawnResult({ stdout: "x".repeat(5_000) + tail }),
    );
    const result = runCommand("echo lots", "/project", 5000, true);
    expect(result.output).toBe("[... truncated ...]\n" + tail);
  });

  it("does not truncate when output fits within limit (tailBiased)", () => {
    spawnSync.mockReturnValue(spawnResult({ stdout: "short" }));
    const result = runCommand("echo short", "/project", 5000, true);
    expect(result.output).toBe("short");
  });
});
