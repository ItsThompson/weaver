import { groupEventsByTurn } from "./group-turns";
import { makeEvent, makeTimedEvent } from "./test-helpers";

describe("groupEventsByTurn", () => {
  it("creates a standalone turn for agentSpawn", () => {
    const events = [makeEvent("agentSpawn")];
    const turns = groupEventsByTurn(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBeNull();
    expect(turns[0].events[0].event.hook_event_name).toBe("agentSpawn");
  });

  it("groups userPromptSubmit through stop as one turn", () => {
    const events = [
      makeEvent("agentSpawn"),
      makeEvent("userPromptSubmit", { prompt: "hello" }),
      makeEvent("stop"),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns).toHaveLength(2);
    expect(turns[1].userPrompt).toBe("hello");
    expect(turns[1].events).toHaveLength(2);
  });

  it("matches preToolUse/postToolUse pairs by tool name sequentially", () => {
    const events = [
      makeTimedEvent("userPromptSubmit", 1000, { prompt: "test" }),
      makeTimedEvent("preToolUse", 2000, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
      }),
      makeTimedEvent("postToolUse", 3000, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
        tool_response: { success: true, result: ["ok"] },
      }),
      makeTimedEvent("stop", 4000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].toolName).toBe("fs_read");
    expect(turns[0].toolCalls[0].input).toEqual({ path: "/a" });
    expect(turns[0].toolCalls[0].response).toBeDefined();
  });

  it("handles parallel calls to different tools", () => {
    const events = [
      makeTimedEvent("userPromptSubmit", 1000, { prompt: "test" }),
      makeTimedEvent("preToolUse", 2000, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
      }),
      makeTimedEvent("preToolUse", 2000, {
        tool_name: "grep",
        tool_input: { pattern: "x" },
      }),
      makeTimedEvent("postToolUse", 3000, {
        tool_name: "grep",
        tool_input: { pattern: "x" },
        tool_response: { success: true, result: [] },
      }),
      makeTimedEvent("postToolUse", 3500, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
        tool_response: { success: true, result: ["data"] },
      }),
      makeTimedEvent("stop", 4000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(2);
    const toolNames = turns[0].toolCalls.map(
      (tc: { toolName: string }) => tc.toolName,
    );
    expect(toolNames).toContain("fs_read");
    expect(toolNames).toContain("grep");
  });

  it("handles multiple calls to the same tool sequentially", () => {
    const events = [
      makeTimedEvent("userPromptSubmit", 1000, { prompt: "test" }),
      makeTimedEvent("preToolUse", 2000, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
      }),
      makeTimedEvent("postToolUse", 3000, {
        tool_name: "fs_read",
        tool_input: { path: "/a" },
        tool_response: { success: true, result: ["a"] },
      }),
      makeTimedEvent("preToolUse", 4000, {
        tool_name: "fs_read",
        tool_input: { path: "/b" },
      }),
      makeTimedEvent("postToolUse", 5000, {
        tool_name: "fs_read",
        tool_input: { path: "/b" },
        tool_response: { success: true, result: ["b"] },
      }),
      makeTimedEvent("stop", 6000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(2);
    expect(turns[0].toolCalls[0].input).toEqual({ path: "/a" });
    expect(turns[0].toolCalls[1].input).toEqual({ path: "/b" });
  });

  it("handles unmatched preToolUse (no response yet)", () => {
    const events = [
      makeTimedEvent("userPromptSubmit", 1000, { prompt: "test" }),
      makeTimedEvent("preToolUse", 2000, {
        tool_name: "execute_bash",
        tool_input: { command: "ls" },
      }),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].toolName).toBe("execute_bash");
    expect(turns[0].toolCalls[0].response).toBeUndefined();
  });

  it("extracts validationResults from a validation event", () => {
    const results = [
      {
        name: "typecheck",
        passed: true,
        output: "",
        duration_ms: 1200,
        timed_out: false,
      },
      {
        name: "test",
        passed: false,
        output: "FAIL src/app.test.ts",
        duration_ms: 3400,
        timed_out: false,
      },
    ];
    const events = [
      makeEvent("userPromptSubmit", { prompt: "fix it" }),
      makeEvent("postToolUse", {
        tool_name: "fs_write",
        tool_input: { path: "/a.ts" },
      }),
      makeEvent("validation", {
        trigger: "stop",
        results,
        changed_files: ["/a.ts"],
        agent_tested_dirs: [],
      }),
      makeEvent("stop"),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].validationResults).toEqual(results);
  });

  it("concatenates results from multiple validation events", () => {
    const r1 = [
      {
        name: "lint",
        passed: true,
        output: "",
        duration_ms: 500,
        timed_out: false,
      },
    ];
    const r2 = [
      {
        name: "test",
        passed: false,
        output: "err",
        duration_ms: 2000,
        timed_out: false,
      },
    ];
    const events = [
      makeEvent("userPromptSubmit", { prompt: "go" }),
      makeEvent("validation", {
        trigger: "postToolUse",
        results: r1,
        changed_files: [],
        agent_tested_dirs: [],
      }),
      makeEvent("validation", {
        trigger: "stop",
        results: r2,
        changed_files: [],
        agent_tested_dirs: [],
      }),
      makeEvent("stop"),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].validationResults).toEqual([...r1, ...r2]);
  });

  it("returns empty validationResults when no validation events", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "hello" }),
      makeEvent("stop"),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].validationResults).toEqual([]);
  });

  it("returns empty validationResults for malformed validation event", () => {
    const events = [
      makeEvent("userPromptSubmit", { prompt: "hello" }),
      makeEvent("validation", { trigger: "stop", results: "not-an-array" }),
      makeEvent("validation", { trigger: "stop" }),
      makeEvent("stop"),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].validationResults).toEqual([]);
  });
});
