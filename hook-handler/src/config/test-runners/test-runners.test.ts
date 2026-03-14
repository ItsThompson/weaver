import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { DEFAULT_TEST_RUNNERS } from "@weaver/shared/types";
import { mockFs } from "../../__test-helpers__/index";

const { existsSync, readFileSync } = await mockFs();
const { resolveTestRunners } = await import("./test-runners");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("resolveTestRunners", () => {
  it("returns defaults when no project or global config", () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners(null);
    expect(runners).toContain("jest");
    expect(runners).toContain("rspec");
  });

  it("merges project runners with defaults", () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners({
      validation: { test_runners: ["mix test"] },
    });
    expect(runners).toContain("jest");
    expect(runners).toContain("mix test");
  });

  it("merges global runners with project runners", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ test_runners: ["custom-global"] }),
    );
    const runners = resolveTestRunners({
      validation: { test_runners: ["custom-project"] },
    });
    expect(runners).toContain("custom-global");
    expect(runners).toContain("custom-project");
  });

  it("deduplicates runners", () => {
    existsSync.mockReturnValue(false);
    const runners = resolveTestRunners({
      validation: { test_runners: ["jest"] },
    });
    expect(runners.filter((r) => r === "jest").length).toBe(1);
  });

  it("filters whitespace-only entries from global config", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ test_runners: ["jest", "  ", "", "pytest"] }),
    );
    const runners = resolveTestRunners(null);
    expect(runners).toContain("jest");
    expect(runners).toContain("pytest");
    expect(runners).not.toContain("  ");
    expect(runners).not.toContain("");
  });

  it("handles non-array test_runners in global config", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ test_runners: "not-array" }));
    const runners = resolveTestRunners(null);
    expect(runners).toEqual(DEFAULT_TEST_RUNNERS);
  });

  it("handles malformed JSON in global config", () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue("not json");
    const runners = resolveTestRunners(null);
    expect(runners).toEqual(DEFAULT_TEST_RUNNERS);
  });
});
