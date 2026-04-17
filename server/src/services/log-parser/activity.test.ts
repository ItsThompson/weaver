import type { WeaverEvent } from "@weaver/shared/types";
import { WeaverEventName } from "@weaver/shared/types";
import { deriveActivity, extractActiveSkillPaths } from "./activity";
import { makeEvent } from "./test-helpers";

describe("deriveActivity", () => {
  it("returns 'starting' for agentSpawn", () => {
    expect(deriveActivity(WeaverEventName.AGENT_SPAWN)).toBe("starting");
  });

  it("returns 'idle' for stop", () => {
    expect(deriveActivity(WeaverEventName.STOP)).toBe("idle");
  });

  it("returns 'running_tool' for recent preToolUse", () => {
    const recent = new Date().toISOString();
    expect(deriveActivity(WeaverEventName.PRE_TOOL_USE, recent)).toBe(
      "running_tool",
    );
  });

  it("returns 'pending_approval' for old preToolUse", () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    expect(deriveActivity(WeaverEventName.PRE_TOOL_USE, old)).toBe(
      "pending_approval",
    );
  });

  it("returns 'running_tool' for preToolUse without timestamp", () => {
    expect(deriveActivity(WeaverEventName.PRE_TOOL_USE)).toBe("running_tool");
  });

  it("returns 'processing' for other events", () => {
    expect(deriveActivity(WeaverEventName.POST_TOOL_USE)).toBe("processing");
    expect(deriveActivity(WeaverEventName.USER_PROMPT_SUBMIT)).toBe(
      "processing",
    );
  });

  it("returns 'starting' for SessionStart", () => {
    expect(deriveActivity(WeaverEventName.SESSION_START)).toBe("starting");
  });

  it("returns 'idle' for SessionEnd", () => {
    expect(deriveActivity(WeaverEventName.SESSION_END)).toBe("idle");
  });
});

describe("extractActiveSkillPaths", () => {
  it("extracts skill paths from postToolUse fs_read events", () => {
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: {
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
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: {
          operations: [{ path: "/Users/me/project/src/index.ts" }],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("ignores preToolUse events", () => {
    const events: WeaverEvent[] = [
      makeEvent("preToolUse", {
        toolName: "fs_read",
        toolInput: {
          operations: [{ path: "/Users/me/.kiro/skills/testing/SKILL.md" }],
        },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("ignores non-fs_read tool events", () => {
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "grep",
        toolInput: { pattern: "skills" },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });

  it("deduplicates paths", () => {
    const skillPath = "/Users/me/.kiro/skills/coding-practices/SKILL.md";
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: { operations: [{ path: skillPath }] },
      }),
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: { operations: [{ path: skillPath }] },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([skillPath]);
  });

  it("handles multiple operations in a single event", () => {
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: {
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

  it("handles malformed toolInput gracefully", () => {
    const events: WeaverEvent[] = [
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: { operations: "not-an-array" },
      }),
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: null,
      }),
      makeEvent("postToolUse", {
        toolName: "fs_read",
        toolInput: { operations: [{ noPath: true }] },
      }),
    ];
    expect(extractActiveSkillPaths(events)).toEqual([]);
  });
});
