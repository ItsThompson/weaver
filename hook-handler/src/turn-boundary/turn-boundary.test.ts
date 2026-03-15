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
import { getCurrentTurnEvents } from "./turn-boundary";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentTurnEvents", () => {
  it("returns events after last userPromptSubmit", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("agentSpawn"),
        makeEvent("userPromptSubmit", { prompt: "first" }),
        makeEvent("postToolUse", { tool_name: "fs_write" }),
        makeEvent("stop"),
        makeEvent("userPromptSubmit", { prompt: "second" }),
        makeEvent("postToolUse", { tool_name: "fs_read" }),
      ].join("\n"),
    );

    const result = getCurrentTurnEvents("/log.jsonl");
    expect(result).toHaveLength(2);
    expect(result[0].event.hook_event_name).toBe("userPromptSubmit");
    expect(result[0].event.prompt).toBe("second");
  });

  it("returns events after last agentSpawn when no userPromptSubmit follows", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("agentSpawn"),
        makeEvent("postToolUse", { tool_name: "fs_write" }),
      ].join("\n"),
    );

    const result = getCurrentTurnEvents("/log.jsonl");
    expect(result).toHaveLength(2);
    expect(result[0].event.hook_event_name).toBe("agentSpawn");
  });

  it("returns all events when no boundary event exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("postToolUse", { tool_name: "fs_write" }),
        makeEvent("stop"),
      ].join("\n"),
    );

    const result = getCurrentTurnEvents("/log.jsonl");
    expect(result).toHaveLength(2);
  });

  it("returns [] for missing log file", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(getCurrentTurnEvents("/missing.jsonl")).toEqual([]);
  });

  it("returns [] for empty log file", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("");
    expect(getCurrentTurnEvents("/empty.jsonl")).toEqual([]);
  });

  it("skips malformed lines gracefully", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      [
        makeEvent("userPromptSubmit", { prompt: "hi" }),
        "not valid json",
        makeEvent("postToolUse", { tool_name: "fs_write" }),
      ].join("\n"),
    );

    const result = getCurrentTurnEvents("/log.jsonl");
    expect(result).toHaveLength(2);
    expect(result[1].event.tool_name).toBe("fs_write");
  });
});
