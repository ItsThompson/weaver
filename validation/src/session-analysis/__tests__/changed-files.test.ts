import "../../__test-helpers__/mock-fs";

import { existsSync, readFileSync } from "node:fs";
import { makeEvent } from "../../__test-helpers__/index";
import { extractChangedFiles } from "../session-analysis";

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
          toolName: "fs_write",
          toolInput: { path: "/old.ts" },
        }),
        makeEvent("stop"),
        makeEvent("userPromptSubmit", { prompt: "second" }),
        makeEvent("postToolUse", {
          toolName: "fs_write",
          toolInput: { path: "/new.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/a.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/a.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/ok.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/project/src/a.ts" },
        }),
        makeEvent("postToolUse", {
          toolName: "fs_write",
          toolInput: { path: "/project/src/b.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/project/src/a.ts" },
        }),
        makeEvent("postToolUse", {
          toolName: "fs_write",
          toolInput: { path: "/project/src/a.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/project/old.ts" },
        }),
        makeEvent("stop"),
        makeEvent("userPromptSubmit", { prompt: "second" }),
        makeEvent("postToolUse", {
          toolName: "fs_write",
          toolInput: { path: "/project/new.ts" },
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
          toolName: "fs_read",
          toolInput: { path: "/project/x.ts" },
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
          toolName: "fs_write",
          toolInput: { path: "/project/ok.ts" },
        }),
      ].join("\n"),
    );

    expect(extractChangedFiles("/log.jsonl")).toEqual(["/project/ok.ts"]);
  });
});
