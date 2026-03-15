import {
  calculateStopTimeout,
  calculatePostToolUseTimeout,
} from "./timeout-calc";
import type {
  StopValidationHook,
  PostToolValidationHook,
} from "../types/validation";

describe("calculateStopTimeout", () => {
  it("sums explicit timeout_ms values with buffer", () => {
    const hooks: StopValidationHook[] = [
      { name: "build", command: "npm run build", timeout_ms: 60_000 },
      { name: "test", command: "npm test", timeout_ms: 30_000 },
    ];
    expect(calculateStopTimeout(hooks)).toBe(105_000);
  });

  it("uses default 30s when timeout_ms is missing", () => {
    const hooks: StopValidationHook[] = [
      { name: "lint", command: "eslint ." },
      { name: "test", command: "npm test" },
    ];
    expect(calculateStopTimeout(hooks)).toBe(75_000);
  });

  it("returns just the buffer for empty array", () => {
    expect(calculateStopTimeout([])).toBe(15_000);
  });

  it("mixes explicit and default timeouts", () => {
    const hooks: StopValidationHook[] = [
      { name: "build", command: "npm run build", timeout_ms: 60_000 },
      { name: "lint", command: "eslint ." },
    ];
    expect(calculateStopTimeout(hooks)).toBe(105_000);
  });
});

describe("calculatePostToolUseTimeout", () => {
  it("takes max group sum with buffer", () => {
    const hooks: PostToolValidationHook[] = [
      {
        matcher: "fs_write",
        name: "eslint",
        command: "eslint",
        timeout_ms: 10_000,
      },
      {
        matcher: "fs_write",
        name: "prettier",
        command: "prettier",
        timeout_ms: 10_000,
      },
      {
        matcher: "execute_bash",
        name: "check",
        command: "check",
        timeout_ms: 5_000,
      },
    ];
    // fs_write group: 20_000, execute_bash group: 5_000, max = 20_000
    expect(calculatePostToolUseTimeout(hooks)).toBe(35_000);
  });

  it("uses default 10s when timeout_ms is missing", () => {
    const hooks: PostToolValidationHook[] = [
      { matcher: "fs_write", name: "eslint", command: "eslint" },
      { matcher: "fs_write", name: "prettier", command: "prettier" },
    ];
    expect(calculatePostToolUseTimeout(hooks)).toBe(35_000);
  });

  it("returns just the buffer for empty array", () => {
    expect(calculatePostToolUseTimeout([])).toBe(15_000);
  });

  it("handles single matcher group", () => {
    const hooks: PostToolValidationHook[] = [
      { matcher: "fs_write", name: "fmt", command: "fmt", timeout_ms: 8_000 },
    ];
    expect(calculatePostToolUseTimeout(hooks)).toBe(23_000);
  });
});
