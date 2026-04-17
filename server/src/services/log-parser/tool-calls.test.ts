import { matchToolCalls } from "./tool-calls";
import { makeTimedEvent } from "./test-helpers";

describe("matchToolCalls", () => {
  it("pairs matching preToolUse and postToolUse events", () => {
    const events = [
      makeTimedEvent("preToolUse", 1000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
      }),
      makeTimedEvent("postToolUse", 2000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["ok"] },
      }),
    ];
    const pairs = matchToolCalls(events);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].toolName).toBe("fs_read");
    expect(pairs[0].input).toEqual({ path: "/a" });
    expect(pairs[0].response).toBeDefined();
    expect(pairs[0].startTime).toBe(new Date(1000).toISOString());
    expect(pairs[0].endTime).toBe(new Date(2000).toISOString());
  });

  it("handles parallel calls to different tools", () => {
    const events = [
      makeTimedEvent("preToolUse", 1000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
      }),
      makeTimedEvent("preToolUse", 1000, {
        toolName: "grep",
        toolInput: { pattern: "x" },
      }),
      makeTimedEvent("postToolUse", 2000, {
        toolName: "grep",
        toolInput: { pattern: "x" },
        toolResponse: { success: true, result: [] },
      }),
      makeTimedEvent("postToolUse", 2500, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["data"] },
      }),
    ];
    const pairs = matchToolCalls(events);
    expect(pairs).toHaveLength(2);
    const toolNames = pairs.map((p) => p.toolName);
    expect(toolNames).toContain("fs_read");
    expect(toolNames).toContain("grep");
  });

  it("handles multiple sequential calls to the same tool", () => {
    const events = [
      makeTimedEvent("preToolUse", 1000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
      }),
      makeTimedEvent("postToolUse", 2000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["a"] },
      }),
      makeTimedEvent("preToolUse", 3000, {
        toolName: "fs_read",
        toolInput: { path: "/b" },
      }),
      makeTimedEvent("postToolUse", 4000, {
        toolName: "fs_read",
        toolInput: { path: "/b" },
        toolResponse: { success: true, result: ["b"] },
      }),
    ];
    const pairs = matchToolCalls(events);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].input).toEqual({ path: "/a" });
    expect(pairs[1].input).toEqual({ path: "/b" });
  });

  it("handles unmatched preToolUse (no response yet)", () => {
    const events = [
      makeTimedEvent("preToolUse", 1000, {
        toolName: "execute_bash",
        toolInput: { command: "ls" },
      }),
    ];
    const pairs = matchToolCalls(events);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].toolName).toBe("execute_bash");
    expect(pairs[0].response).toBeUndefined();
    expect(pairs[0].endTime).toBeUndefined();
  });

  it("handles postToolUse without matching preToolUse", () => {
    const events = [
      makeTimedEvent("postToolUse", 2000, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["ok"] },
      }),
    ];
    const pairs = matchToolCalls(events);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].startTime).toBe(pairs[0].endTime);
  });

  it("ignores events without toolName", () => {
    const events = [
      makeTimedEvent("userPromptSubmit", 1000, { prompt: "hello" }),
      makeTimedEvent("stop", 2000),
    ];
    expect(matchToolCalls(events)).toEqual([]);
  });
});
