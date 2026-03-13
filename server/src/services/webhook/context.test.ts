import type { HookEvent } from "@weaver/shared/types";
import { extractContext } from "./context";

function makeEvent(
  name: string,
  extra: Record<string, unknown> = {},
): HookEvent {
  return {
    timestamp: "2026-01-01T00:00:00Z",
    event: { hook_event_name: name, cwd: "/tmp", ...extra },
  };
}

describe("extractContext", () => {
  it("returns null for agentSpawn", () => {
    expect(extractContext("agentSpawn", [])).toBeNull();
  });

  it("returns null for stop", () => {
    expect(extractContext("stop", [makeEvent("stop")])).toBeNull();
  });

  it("returns prompt with null tool fields for userPromptSubmit", () => {
    const events = [makeEvent("userPromptSubmit", { prompt: "hello" })];
    expect(extractContext("userPromptSubmit", events)).toEqual({
      prompt: "hello",
      tool_name: null,
      tool_input: null,
      tool_response: null,
    });
  });

  it("returns null prompt when no userPromptSubmit exists", () => {
    const events = [
      makeEvent("preToolUse", { tool_name: "fs_read", tool_input: {} }),
    ];
    const ctx = extractContext("preToolUse", events);
    expect(ctx?.prompt).toBeNull();
    expect(ctx?.tool_name).toBe("fs_read");
  });

  it("uses the last userPromptSubmit when multiple exist", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "first" }),
      makeEvent("userPromptSubmit", { prompt: "second" }),
      makeEvent("preToolUse", { tool_name: "grep", tool_input: {} }),
    ];
    expect(extractContext("preToolUse", events)?.prompt).toBe("second");
  });

  it("extracts tool context for preToolUse", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "do it" }),
      makeEvent("preToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/a.ts" },
      }),
    ];
    expect(extractContext("preToolUse", events)).toEqual({
      prompt: "do it",
      tool_name: "fs_write",
      tool_input: { path: "/a.ts" },
      tool_response: null,
    });
  });

  it("returns null tool fields when no matching tool event exists", () => {
    const events = [makeEvent("userPromptSubmit", { prompt: "test" })];
    expect(extractContext("preToolUse", events)).toEqual({
      prompt: "test",
      tool_name: null,
      tool_input: null,
      tool_response: null,
    });
  });

  it("includes tool_response for postToolUse", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "read" }),
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
        tool_response: { success: true, result: ["ok"] },
      }),
    ];
    expect(extractContext("postToolUse", events)).toEqual({
      prompt: "read",
      tool_name: "fs_read",
      tool_input: { path: "/a" },
      tool_response: { success: true, result: ["ok"] },
    });
  });

  it("returns null tool_response for postToolUse when response is falsy", () => {
    const events = [
      makeEvent("postToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/a" },
      }),
    ];
    expect(extractContext("postToolUse", events)?.tool_response).toBeNull();
  });

  it("returns null tool_response for preToolUse even if event has one", () => {
    const events = [
      makeEvent("preToolUse", {
        tool_name: "fs_read",
        tool_input: {},
        tool_response: { success: true, result: [] },
      }),
    ];
    expect(extractContext("preToolUse", events)?.tool_response).toBeNull();
  });

  it("returns tool context for unknown event names", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "go" }),
      makeEvent("customEvent", { tool_name: "x", tool_input: { a: 1 } }),
    ];
    const ctx = extractContext("customEvent", events);
    expect(ctx?.prompt).toBe("go");
    expect(ctx?.tool_name).toBe("x");
  });
});
