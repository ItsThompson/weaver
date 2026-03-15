import "../../__test-helpers__/mock-fs";

import { existsSync, readFileSync } from "node:fs";
import { readProjectConfig } from "./project-config";

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stderrSpy.mockRestore();
});

describe("readProjectConfig", () => {
  it("returns null when .weaver.json file does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readProjectConfig("/project")).toBeNull();
  });

  it("returns parsed config with all fields", () => {
    const config = {
      validation: {
        stop: [
          { name: "typecheck", command: "npx tsc --noEmit", timeout_ms: 30000 },
        ],
        postToolUse: [
          {
            matcher: "fs_write",
            name: "format",
            command: "npx prettier --write {{file}}",
          },
        ],
      },
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(config));
    expect(readProjectConfig("/project")).toEqual(config);
  });

  it("returns null and warns on invalid JSON", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("not json{");
    expect(readProjectConfig("/project")).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
    );
  });

  it("returns config with empty validation object", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ validation: {} }));
    expect(readProjectConfig("/project")).toEqual({ validation: {} });
  });

  it("returns config without validation key", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));
    expect(readProjectConfig("/project")).toEqual({});
  });

  it("filters out stop hook missing name", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        validation: {
          stop: [{ command: "echo hi" }, { name: "ok", command: "echo ok" }],
        },
      }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.stop).toEqual([
      { name: "ok", command: "echo ok" },
    ]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid stop hook"),
    );
  });

  it("filters out stop hook missing command", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        validation: { stop: [{ name: "bad" }] },
      }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.stop).toEqual([]);
  });

  it("filters out postToolUse hook missing matcher", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        validation: { postToolUse: [{ name: "fmt", command: "echo" }] },
      }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.postToolUse).toEqual([]);
  });

  it("preserves optional fields on valid hooks", () => {
    const hook = {
      name: "test",
      command: "jest",
      scope: "parent",
      run_if_files_match: "**/*.ts",
      working_dir: "src",
      timeout_ms: 5000,
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: { stop: [hook] } }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.stop![0]).toEqual(hook);
  });

  it("parses test_runners from project config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: { test_runners: ["rspec", "mix test"] } }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.test_runners).toEqual(["rspec", "mix test"]);
  });

  it("filters non-string test_runners entries", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: { test_runners: ["jest", 42, null] } }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.test_runners).toEqual(["jest"]);
  });

  it("returns null and warns when top-level value is not an object", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    for (const value of ['"hello"', "42", "null", "[1,2]"]) {
      vi.clearAllMocks();
      stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(value);
      expect(readProjectConfig("/project")).toBeNull();
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("must be a JSON object"),
      );
    }
  });

  it("returns {} and warns when validation is not an object", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: "bad" }),
    );
    expect(readProjectConfig("/project")).toEqual({});
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("validation must be an object"),
    );
  });

  it("warns and skips when validation.stop is not an array", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: { stop: "bad" } }),
    );
    const result = readProjectConfig("/project");
    expect(result).toEqual({ validation: {} });
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("stop must be an array"),
    );
  });

  it("warns and skips when validation.postToolUse is not an array", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ validation: { postToolUse: 42 } }),
    );
    const result = readProjectConfig("/project");
    expect(result).toEqual({ validation: {} });
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("postToolUse must be an array"),
    );
  });

  it("filters out stop hook with invalid scope type", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        validation: {
          stop: [
            { name: "bad-scope", command: "echo", scope: true },
            { name: "ok", command: "echo ok" },
          ],
        },
      }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.stop).toEqual([
      { name: "ok", command: "echo ok" },
    ]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid stop hook"),
    );
  });

  it("filters out stop hook with invalid timeout_ms type", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        validation: {
          stop: [{ name: "bad-timeout", command: "echo", timeout_ms: "30000" }],
        },
      }),
    );
    const result = readProjectConfig("/project");
    expect(result!.validation!.stop).toEqual([]);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid stop hook"),
    );
  });
});
