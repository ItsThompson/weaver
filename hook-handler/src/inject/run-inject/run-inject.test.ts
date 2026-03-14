import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { mockFs } from "../../__test-helpers__/index";

const { existsSync, readFileSync, unlinkSync } = await mockFs();

const { runInject } = await import("./run-inject");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("runInject", () => {
  it("exits 0 with no output when pending file does not exist", () => {
    existsSync.mockReturnValue(false);
    const result = runInject("sess-1");
    expect(result).toEqual({ stdout: "", exitCode: 0 });
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("formats output with summary and failed details only", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        results: [
          {
            name: "typecheck",
            passed: false,
            output: "error TS2345: bad type",
            duration_ms: 2300,
            timed_out: false,
          },
          {
            name: "lint",
            passed: true,
            output: "",
            duration_ms: 1100,
            timed_out: false,
          },
        ],
      }),
    );

    const result = runInject("sess-1");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[Weaver Validation — Previous Turn]");
    expect(result.stdout).toContain("1 passed · 1 failed");
    expect(result.stdout).toContain("✗ typecheck (2.3s)");
    expect(result.stdout).toContain("  error TS2345: bad type");
    expect(result.stdout).not.toContain("✓ lint");
    expect(result.stdout).toContain("Re-run failing commands for full output.");
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("deletes malformed pending file and exits 0 with no output", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("not valid json{{{");

    const result = runInject("sess-1");
    expect(result).toEqual({ stdout: "", exitCode: 0 });
    expect(unlinkSync).toHaveBeenCalled();
  });

  it("counts skipped results in summary instead of showing ⊘ marker", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        results: [
          {
            name: "test:server",
            passed: true,
            output: "",
            duration_ms: 0,
            timed_out: false,
            skipped_reason: "already tested by agent",
          },
        ],
      }),
    );

    const result = runInject("sess-1");
    expect(result.stdout).toContain("1 skipped");
    expect(result.stdout).not.toContain("⊘");
  });

  it("shows only summary for all-passed results", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        results: [
          {
            name: "lint",
            passed: true,
            output: "",
            duration_ms: 500,
            timed_out: false,
          },
        ],
      }),
    );

    const result = runInject("sess-1");
    expect(result.stdout).toContain("1 passed");
    expect(result.stdout).not.toContain("✓ lint");
    expect(result.stdout).not.toContain("Re-run");
  });

  it("shows failed results with ✗ marker and indented output", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        results: [
          {
            name: "typecheck",
            passed: false,
            output: "line1\nline2",
            duration_ms: 3000,
            timed_out: false,
          },
        ],
      }),
    );

    const result = runInject("sess-1");
    expect(result.stdout).toContain("✗ typecheck (3.0s)");
    expect(result.stdout).toContain("  line1\n  line2");
  });

  it("shows timed_out indicator on failed results", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        results: [
          {
            name: "slow",
            passed: false,
            output: "",
            duration_ms: 30000,
            timed_out: true,
          },
        ],
      }),
    );

    const result = runInject("sess-1");
    expect(result.stdout).toContain("✗ slow (30.0s, timed out)");
  });

  it("exits 0 with no output when session-id is empty", () => {
    const result = runInject("");
    expect(result).toEqual({ stdout: "", exitCode: 0 });
  });
});
