import "../../__test-helpers__/mock-fs";

import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_TEST_RUNNERS } from "@weaver/shared/types";
import { resolveTestRunners } from "./test-runners";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveTestRunners", () => {
  it("returns defaults when no project or global config", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const runners = resolveTestRunners(null);
    expect(runners).toContain("jest");
    expect(runners).toContain("rspec");
  });

  it("merges project runners with defaults", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const runners = resolveTestRunners({
      validation: { test_runners: ["mix test"] },
    });
    expect(runners).toContain("jest");
    expect(runners).toContain("mix test");
  });

  it("merges global runners with project runners", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ test_runners: ["custom-global"] }),
    );
    const runners = resolveTestRunners({
      validation: { test_runners: ["custom-project"] },
    });
    expect(runners).toContain("custom-global");
    expect(runners).toContain("custom-project");
  });

  it("deduplicates runners", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const runners = resolveTestRunners({
      validation: { test_runners: ["jest"] },
    });
    expect(runners.filter((r) => r === "jest").length).toBe(1);
  });

  it("filters whitespace-only entries from global config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ test_runners: ["jest", "  ", "", "pytest"] }),
    );
    const runners = resolveTestRunners(null);
    expect(runners).toContain("jest");
    expect(runners).toContain("pytest");
    expect(runners).not.toContain("  ");
    expect(runners).not.toContain("");
  });

  it("handles non-array test_runners in global config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ test_runners: "not-array" }),
    );
    const runners = resolveTestRunners(null);
    expect(runners).toEqual(DEFAULT_TEST_RUNNERS);
  });

  it("handles malformed JSON in global config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("not json");
    const runners = resolveTestRunners(null);
    expect(runners).toEqual(DEFAULT_TEST_RUNNERS);
  });
});
