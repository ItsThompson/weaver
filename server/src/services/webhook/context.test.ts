import type { WeaverEvent } from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import { extractContext } from "./context";

function makeEvent(
  name: WeaverEventName,
  extra: Record<string, unknown> = {},
): WeaverEvent {
  return {
    sessionId: "test-session",
    timestamp: "2026-01-01T00:00:00Z",
    harness: Harness.KIRO_CLI,
    eventName: name,
    cwd: "/tmp",
    ...extra,
  };
}

describe("extractContext", () => {
  it("returns null for agentSpawn", () => {
    expect(extractContext(WeaverEventName.AGENT_SPAWN, [])).toBeNull();
  });

  it("returns null for stop", () => {
    expect(
      extractContext(WeaverEventName.STOP, [makeEvent(WeaverEventName.STOP)]),
    ).toBeNull();
  });

  it("returns prompt with null tool fields for userPromptSubmit", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "hello" }),
    ];
    expect(extractContext(WeaverEventName.USER_PROMPT_SUBMIT, events)).toEqual({
      prompt: "hello",
      tool_name: null,
      tool_input: null,
      tool_response: null,
    });
  });

  it("returns null prompt when no userPromptSubmit exists", () => {
    const events = [
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_read",
        toolInput: {},
      }),
    ];
    const ctx = extractContext(WeaverEventName.PRE_TOOL_USE, events);
    expect(ctx?.prompt).toBeNull();
    expect(ctx?.tool_name).toBe("fs_read");
  });

  it("uses the last userPromptSubmit when multiple exist", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "first" }),
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "second" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "grep",
        toolInput: {},
      }),
    ];
    expect(extractContext(WeaverEventName.PRE_TOOL_USE, events)?.prompt).toBe(
      "second",
    );
  });

  it("extracts tool context for preToolUse", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "do it" }),
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/a.ts" },
      }),
    ];
    expect(extractContext(WeaverEventName.PRE_TOOL_USE, events)).toEqual({
      prompt: "do it",
      tool_name: "fs_write",
      tool_input: { path: "/a.ts" },
      tool_response: null,
    });
  });

  it("returns null tool fields when no matching tool event exists", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "test" }),
    ];
    expect(extractContext(WeaverEventName.PRE_TOOL_USE, events)).toEqual({
      prompt: "test",
      tool_name: null,
      tool_input: null,
      tool_response: null,
    });
  });

  it("includes toolResponse for postToolUse", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "read" }),
      makeEvent(WeaverEventName.POST_TOOL_USE, {
        toolName: "fs_read",
        toolInput: { path: "/a" },
        toolResponse: { success: true, result: ["ok"] },
      }),
    ];
    expect(extractContext(WeaverEventName.POST_TOOL_USE, events)).toEqual({
      prompt: "read",
      tool_name: "fs_read",
      tool_input: { path: "/a" },
      tool_response: { success: true, result: ["ok"] },
    });
  });

  it("returns null tool_response for postToolUse when response is falsy", () => {
    const events = [
      makeEvent(WeaverEventName.POST_TOOL_USE, {
        toolName: "fs_write",
        toolInput: { path: "/a" },
      }),
    ];
    expect(
      extractContext(WeaverEventName.POST_TOOL_USE, events)?.tool_response,
    ).toBeNull();
  });

  it("returns null tool_response for preToolUse even if event has one", () => {
    const events = [
      makeEvent(WeaverEventName.PRE_TOOL_USE, {
        toolName: "fs_read",
        toolInput: {},
        toolResponse: { success: true, result: [] },
      }),
    ];
    expect(
      extractContext(WeaverEventName.PRE_TOOL_USE, events)?.tool_response,
    ).toBeNull();
  });

  it("returns tool context for unknown event names", () => {
    const events = [
      makeEvent(WeaverEventName.USER_PROMPT_SUBMIT, { prompt: "go" }),
      makeEvent(WeaverEventName.NOTIFICATION, {
        toolName: "x",
        toolInput: { a: 1 },
      }),
    ];
    const ctx = extractContext(WeaverEventName.NOTIFICATION, events);
    expect(ctx?.prompt).toBe("go");
    expect(ctx?.tool_name).toBe("x");
  });
});
