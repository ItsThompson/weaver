import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { mockFs } from "../../__test-helpers__/index";

const { writeFileSync } = await mockFs();

const { handleExitLogic } = await import("./exit");

beforeEach(() => {
  jest.clearAllMocks();
});

const passed = {
  name: "lint",
  passed: true,
  output: "",
  duration_ms: 10,
  timed_out: false,
};
const failed = {
  name: "typecheck",
  passed: false,
  output: "err",
  duration_ms: 20,
  timed_out: false,
};
const skipped = {
  name: "test",
  passed: true,
  output: "",
  duration_ms: 0,
  timed_out: false,
  skipped_reason: "no files",
};

describe("handleExitLogic", () => {
  it("returns exit 0 when all pass", () => {
    const result = handleExitLogic("sess-1", [passed]);
    expect(result.exitCode).toBe(0);
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("returns exit 1 with stderr summary when some fail", () => {
    const result = handleExitLogic("sess-1", [passed, failed]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("1/2 validations failed (typecheck)");
  });

  it("writes pending file on failure", () => {
    handleExitLogic("sess-1", [failed]);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("sess-1.pending"),
      expect.stringContaining("typecheck"),
    );
  });

  it("excludes skipped results from counts", () => {
    const result = handleExitLogic("sess-1", [failed, skipped]);
    expect(result.stderr).toContain("1/1 validations failed");
  });

  it("returns exit 0 when only skipped results", () => {
    const result = handleExitLogic("sess-1", [skipped]);
    expect(result.exitCode).toBe(0);
  });
});
