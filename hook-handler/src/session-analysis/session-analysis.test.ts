import "../__test-helpers__/mock-fs";

import { existsSync, readFileSync } from "node:fs";
import { makeEvent } from "../__test-helpers__/index";
import {
  extractChangedFiles,
  extractAgentTestedDirs,
  isWithinDir,
} from "./session-analysis";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- getCurrentTurnEvents (tested indirectly through extractChangedFiles) ---

describe("getCurrentTurnEvents (via extractChangedFiles)", () => {
  it("returns events after last userPromptSubmit", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("agentSpawn"),
        makeEvent("userPromptSubmit", { prompt: "first" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/old.ts" },
        }),
        makeEvent("stop"),
        makeEvent("userPromptSubmit", { prompt: "second" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/new.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/new.ts"]);
  });

  it("returns events after last agentSpawn when no userPromptSubmit follows", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("agentSpawn"),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/a.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/a.ts"]);
  });

  it("returns all events when no boundary event exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/a.ts" },
        }),
        makeEvent("stop"),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/a.ts"]);
  });

  it("returns [] for missing log file", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(extractChangedFiles("/missing.jsonl")).toEqual([]);
  });

  it("returns [] for empty log file", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("");
    expect(extractChangedFiles("/empty.jsonl")).toEqual([]);
  });

  it("skips malformed lines gracefully", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "hi" }),
        "not valid json",
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/ok.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/ok.ts"]);
  });
});

// --- extractChangedFiles ---

describe("extractChangedFiles", () => {
  it("extracts file paths from fs_write postToolUse events in current turn", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/src/a.ts" },
        }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/src/b.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual([
      "/project/src/a.ts",
      "/project/src/b.ts",
    ]);
  });

  it("deduplicates repeated writes to the same file", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/src/a.ts" },
        }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/src/a.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/project/src/a.ts"]);
  });

  it("ignores events from previous turns", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "first" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/old.ts" },
        }),
        makeEvent("stop"),
        makeEvent("userPromptSubmit", { prompt: "second" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/new.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/project/new.ts"]);
  });

  it("returns [] for empty session log", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(extractChangedFiles("/missing.jsonl")).toEqual([]);
  });

  it("returns [] when no fs_write events in turn", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "fs_read",
          tool_input: { path: "/project/x.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual([]);
  });

  it("handles malformed log lines gracefully", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        "broken json line",
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/ok.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/project/ok.ts"]);
  });
});

// --- extractAgentTestedDirs ---

const DEFAULT_RUNNERS = [
  "jest",
  "vitest",
  "mocha",
  "pytest",
  "rspec",
  "cargo test",
  "npm test",
  "npx test",
  "bundle exec rspec",
];

describe("extractAgentTestedDirs", () => {
  it("detects npx jest with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "npx jest src/features/auth/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["src/features/auth"]);
  });

  it("detects npm test as CWD", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "npm test" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["."]);
  });

  it("detects vitest run with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "vitest run src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["src"]);
  });

  it("detects pytest with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "pytest tests/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["tests"]);
  });

  it("detects cargo test as CWD", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "cargo test" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["."]);
  });

  it("detects rspec with directory arg", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "bundle exec rspec spec/models/order/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual(["spec/models/order"]);
  });

  it("detects custom test runner from config", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "mix test test/models/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", ["mix test"]),
    ).toEqual(["test/models"]);
  });

  it("ignores non-test execute_bash commands", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "ls -la" },
        }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "cat foo.ts" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("returns [] when no execute_bash events in turn", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "fs_write",
          tool_input: { path: "/project/a.ts" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("returns [] when command has no parseable input", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(
      extractAgentTestedDirs("/missing.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("does not match runner embedded in another word (e.g. my-pytest-wrapper)", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "my-pytest-wrapper src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", DEFAULT_RUNNERS),
    ).toEqual([]);
  });

  it("matches runner with special characters like c++ test", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "c++ test src/" },
        }),
      ].join("\n"),
    );

    expect(
      extractAgentTestedDirs("/log.jsonl", "/project", ["c++ test"]),
    ).toEqual(["src"]);
  });

  it("returns [] when test runners list is empty", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "go" }),
        makeEvent("postToolUse", {
          tool_name: "execute_bash",
          tool_input: { command: "npx jest src/" },
        }),
      ].join("\n"),
    );

    expect(extractAgentTestedDirs("/log.jsonl", "/project", [])).toEqual([]);
  });
});

// --- isWithinDir ---

describe("isWithinDir", () => {
  it.each([
    ["/project/src/a.ts", "/project", true, "file inside dir"],
    ["/project/a.ts", "/project", true, "file at dir root"],
    ["/project/a/b/c.ts", "/project", true, "deeply nested file"],
    ["/other/a.ts", "/project", false, "file outside dir"],
    [
      "/project-other/file.ts",
      "/project",
      false,
      "similar prefix, not a parent",
    ],
    ["/a.ts", "/project/sub", false, "parent directory file"],
  ])("%s in %s → %s (%s)", (filePath, dir, expected) => {
    expect(isWithinDir(filePath, dir)).toBe(expected);
  });
});
