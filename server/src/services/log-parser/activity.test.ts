import type { HookEvent } from "@weaver/shared/types";
import { deriveActivity, extractActiveSkillPaths } from "./activity";
import { makeEvent } from "./test-helpers";

describe("deriveActivity", () => {
  it("returns 'starting' for agentSpawn", () => {
    expect(deriveActivity("agentSpawn")).toBe("starting");
  });

  it("returns 'idle' for stop", () => {
    expect(deriveActivity("stop")).toBe("idle");
  });

  it("returns 'running_tool' for recent preToolUse", () => {
    const recent = new Date().toISOString();
    expect(deriveActivity("preToolUse", recent)).toBe("running_tool");
  });

  it("returns 'pending_approval' for old preToolUse", () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    expect(deriveActivity("preToolUse", old)).toBe("pending_approval");
  });

  it("returns 'running_tool' for preToolUse without timestamp", () => {
    expect(deriveActivity("preToolUse")).toBe("running_tool");
  });

  it("returns 'processing' for other events", () => {
    expect(deriveActivity("postToolUse")).toBe("processing");
    expect(deriveActivity("userPromptSubmit")).toBe("processing");
  });
});

describe("extractActiveSkillPaths", () => {
  it("extracts skill paths from postToolUse fs_read events", () => {
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: {
          operations: [
            {
              path: "/Users/me/.config/amazonq/global/skills/coding-practices/SKILL.md",
            },
          ],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([
      "/Users/me/.config/amazonq/global/skills/coding-practices/SKILL.md",
    ]);
  });

  it("ignores non-skill fs_read paths", () => {
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: {
          operations: [{ path: "/Users/me/project/src/index.ts" }],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("ignores preToolUse events", () => {
    const events: HookEvent[] = [
      makeEvent("preToolUse", {
        tool_name: "fs_read",
        tool_input: {
          operations: [{ path: "/Users/me/.kiro/skills/testing/SKILL.md" }],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("ignores non-fs_read tool events", () => {
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "grep",
        tool_input: { pattern: "skills" },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("deduplicates paths", () => {
    const skillPath = "/Users/me/.kiro/skills/coding-practices/SKILL.md";
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: { operations: [{ path: skillPath }] },
      }),
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: { operations: [{ path: skillPath }] },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([skillPath]);
  });

  it("handles multiple operations in a single event", () => {
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: {
          operations: [
            { path: "/Users/me/.kiro/skills/coding-practices/SKILL.md" },
            { path: "/Users/me/project/src/index.ts" },
            { path: "/Users/me/.kiro/skills/testing/SKILL.md" },
          ],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([
      "/Users/me/.kiro/skills/coding-practices/SKILL.md",
      "/Users/me/.kiro/skills/testing/SKILL.md",
    ]);
  });

  it("returns empty array for empty events", () => {
    expect(extractActiveSkillPaths([])).toEqual([]);
  });

  it("handles malformed tool_input gracefully", () => {
    const events: HookEvent[] = [
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: { operations: "not-an-array" },
      }),
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: null,
      }),
      makeEvent("postToolUse", {
        tool_name: "fs_read",
        tool_input: { operations: [{ noPath: true }] },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });
});
