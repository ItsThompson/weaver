import { formatPendingOutput } from "./formatting";

describe("formatPendingOutput", () => {
  it("counts passed, failed, and skipped in summary", () => {
    const output = formatPendingOutput([
      {
        name: "lint",
        passed: true,
        output: "",
        duration_ms: 1000,
        timed_out: false,
      },
      {
        name: "typecheck",
        passed: false,
        output: "err",
        duration_ms: 2000,
        timed_out: false,
      },
      {
        name: "test",
        passed: true,
        output: "",
        duration_ms: 0,
        timed_out: false,
        skipped_reason: "no files",
      },
    ]);
    expect(output).toContain("1 passed · 1 failed · 1 skipped");
  });

  it("only includes failed result details", () => {
    const output = formatPendingOutput([
      {
        name: "lint",
        passed: true,
        output: "",
        duration_ms: 1000,
        timed_out: false,
      },
      {
        name: "typecheck",
        passed: false,
        output: "error TS2322",
        duration_ms: 2300,
        timed_out: false,
      },
    ]);
    expect(output).toContain("✗ typecheck (2.3s)");
    expect(output).toContain("  error TS2322");
    expect(output).not.toContain("✓");
  });

  it("includes re-run hint only when there are failures", () => {
    const withFailure = formatPendingOutput([
      {
        name: "typecheck",
        passed: false,
        output: "err",
        duration_ms: 1000,
        timed_out: false,
      },
    ]);
    expect(withFailure).toContain("Re-run failing commands for full output.");

    const allPassed = formatPendingOutput([
      {
        name: "lint",
        passed: true,
        output: "",
        duration_ms: 1000,
        timed_out: false,
      },
    ]);
    expect(allPassed).not.toContain("Re-run");
  });

  it("handles all-passed results", () => {
    const output = formatPendingOutput([
      {
        name: "lint",
        passed: true,
        output: "",
        duration_ms: 500,
        timed_out: false,
      },
      {
        name: "typecheck",
        passed: true,
        output: "",
        duration_ms: 800,
        timed_out: false,
      },
    ]);
    expect(output).toContain("2 passed");
    expect(output).not.toContain("failed");
    expect(output).not.toContain("Re-run");
  });

  it("handles all-skipped results", () => {
    const output = formatPendingOutput([
      {
        name: "test",
        passed: true,
        output: "",
        duration_ms: 0,
        timed_out: false,
        skipped_reason: "no files",
      },
    ]);
    expect(output).toContain("1 skipped");
    expect(output).not.toContain("passed");
    expect(output).not.toContain("Re-run");
  });
});
