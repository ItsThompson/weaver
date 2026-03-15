vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
  readFileSync: vi.fn<() => string>(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  realpathSync: vi.fn<(p: string) => string>(),
}));

import { existsSync, readFileSync } from "node:fs";
import { makeEvent } from "../__test-helpers__/index";
import { extractChangedFiles } from "./changed-files";

beforeEach(() => {
  vi.clearAllMocks();
});

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
