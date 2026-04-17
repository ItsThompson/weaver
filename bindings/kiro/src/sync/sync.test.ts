import "./__test-helpers__/mock-os";
import "./__test-helpers__/mock-fs";

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { syncAgentTimeouts } from "./sync";
import {
  weaverConfig,
  makeAgentConfig,
  setupFs,
} from "./__test-helpers__/sync-helpers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncAgentTimeouts", () => {
  it("patches stop and postToolUse timeouts in agent configs", () => {
    setupFs({ "agent.json": makeAgentConfig(180_000) });

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(2); // workspace + global
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledTimes(2);

    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.stop[0].timeout_ms).toBe(105_000);
    expect(written.hooks.postToolUse[0].timeout_ms).toBe(35_000);
  });

  it("returns empty result when no .weaver.json exists", () => {
    setupFs({}, null);

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("returns empty result when no validation key", () => {
    setupFs({}, JSON.stringify({}));

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(0);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("returns empty result when no agent dirs exist", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith(".weaver.json")) {
        return true;
      }
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(weaverConfig);
    vi.mocked(readdirSync).mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(0);
  });

  it("skips agent config with no weaver-log.sh hooks", () => {
    const nonWeaverAgent = JSON.stringify({
      name: "other",
      hooks: {
        stop: [{ command: "some-other-hook.sh" }],
      },
    });
    setupFs({ "other.json": nonWeaverAgent });

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("skips files that already have correct values", () => {
    setupFs({ "agent.json": makeAgentConfig(105_000, 35_000) });

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("patches only stop when no postToolUse hooks configured", () => {
    const stopOnlyConfig = JSON.stringify({
      validation: {
        stop: [{ name: "build", command: "npm run build", timeout_ms: 60_000 }],
      },
    });
    setupFs({ "agent.json": makeAgentConfig(180_000) }, stopOnlyConfig);

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(2);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    expect(written.hooks.stop[0].timeout_ms).toBe(75_000);
    // postToolUse not patched (no weaver postToolUse hooks)
    expect(written.hooks.postToolUse[0].timeout_ms).toBeUndefined();
  });

  it("includes malformed agent JSON in errors", () => {
    setupFs({ "bad.json": "not json{" });

    const result = syncAgentTimeouts("/project");

    expect(result.errors.some((error) => error.includes("bad.json"))).toBe(
      true,
    );
  });

  it("does not write files in dry run mode", () => {
    setupFs({ "agent.json": makeAgentConfig(180_000) });

    const result = syncAgentTimeouts("/project", { dryRun: true });

    expect(result.patched).toHaveLength(2);
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it("uses default timeouts when hooks omit timeout_ms", () => {
    const configWithDefaults = JSON.stringify({
      validation: {
        stop: [{ name: "lint", command: "eslint ." }],
        postToolUse: [
          { matcher: "fs_write", name: "fmt", command: "prettier" },
        ],
      },
    });
    setupFs({ "agent.json": makeAgentConfig() }, configWithDefaults);

    const result = syncAgentTimeouts("/project");

    expect(result.patched).toHaveLength(2);
    const written = JSON.parse(
      vi.mocked(writeFileSync).mock.calls[0][1] as string,
    );
    // default stop: 30_000 + 15_000 buffer = 45_000
    expect(written.hooks.stop[0].timeout_ms).toBe(45_000);
    // default postToolUse: 10_000 + 15_000 buffer = 25_000
    expect(written.hooks.postToolUse[0].timeout_ms).toBe(25_000);
  });

  it("skips non-json files in agent directory", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.endsWith(".weaver.json")) {
        return weaverConfig;
      }
      return makeAgentConfig(180_000);
    });
    vi.mocked(readdirSync).mockReturnValue([
      "agent.json",
      "prompt.md",
      "notes.txt",
    ] as unknown as ReturnType<typeof readdirSync>);

    syncAgentTimeouts("/project");

    // readFileSync should only be called for .weaver.json + agent.json (×2 dirs)
    const readCalls = vi
      .mocked(readFileSync)
      .mock.calls.map((call) => String(call[0]));
    expect(readCalls.some((path) => path.endsWith("prompt.md"))).toBe(false);
    expect(readCalls.some((path) => path.endsWith("notes.txt"))).toBe(false);
  });
});
