import { describe, it, expect } from "vitest";
import { kiroAdapter } from "./adapter";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { EventContext } from "@weaver/shared/types";

const context: EventContext = {
  sessionId: "test-session-123",
  timestamp: "2026-01-01T00:00:00Z",
  pid: 12345,
};

describe("kiroAdapter", () => {
  it("has correct metadata", () => {
    expect(kiroAdapter.name).toBe(Harness.KIRO_CLI);
    expect(kiroAdapter.processName).toBe("kiro-cli");
    expect(kiroAdapter.providesSessionId).toBe(false);
  });

  describe("parseEvent", () => {
    it("maps agentSpawn", () => {
      const event = kiroAdapter.parseEvent(
        { hook_event_name: "agentSpawn", cwd: "/project" },
        context,
      );
      expect(event).toMatchObject({
        sessionId: "test-session-123",
        timestamp: "2026-01-01T00:00:00Z",
        harness: Harness.KIRO_CLI,
        eventName: WeaverEventName.AGENT_SPAWN,
        cwd: "/project",
        pid: 12345,
      });
    });

    it("maps stop", () => {
      const event = kiroAdapter.parseEvent(
        { hook_event_name: "stop", cwd: "/project" },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.STOP);
    });

    it("maps preToolUse with tool fields", () => {
      const event = kiroAdapter.parseEvent(
        {
          hook_event_name: "preToolUse",
          cwd: "/project",
          tool_name: "fs_read",
          tool_input: { path: "/file.ts" },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.PRE_TOOL_USE);
      expect(event.toolName).toBe("read");
      expect(event.toolInput).toEqual({ path: "/file.ts" });
    });

    it("maps postToolUse with tool response", () => {
      const event = kiroAdapter.parseEvent(
        {
          hook_event_name: "postToolUse",
          cwd: "/project",
          tool_name: "fs_write",
          tool_input: { path: "/file.ts" },
          tool_response: { success: true, result: ["ok"] },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.POST_TOOL_USE);
      expect(event.toolName).toBe("write");
    });

    it("maps userPromptSubmit with prompt", () => {
      const event = kiroAdapter.parseEvent(
        {
          hook_event_name: "userPromptSubmit",
          cwd: "/project",
          prompt: "fix the bug",
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.USER_PROMPT_SUBMIT);
      expect(event.prompt).toBe("fix the bug");
    });

    it("throws for unknown event name", () => {
      expect(() =>
        kiroAdapter.parseEvent(
          { hook_event_name: "unknownEvent", cwd: "/project" },
          context,
        ),
      ).toThrow('Unknown kiro-cli event: "unknownEvent"');
    });

    it("omits undefined optional fields", () => {
      const event = kiroAdapter.parseEvent(
        { hook_event_name: "stop", cwd: "/project" },
        context,
      );
      expect(event.prompt).toBeUndefined();
      expect(event.toolName).toBeUndefined();
      expect(event.toolInput).toBeUndefined();
      expect(event.toolResponse).toBeUndefined();
    });

    it("passes through unknown tool names unchanged", () => {
      const event = kiroAdapter.parseEvent(
        {
          hook_event_name: "preToolUse",
          cwd: "/project",
          tool_name: "mcp_custom_tool",
        },
        context,
      );
      expect(event.toolName).toBe("mcp_custom_tool");
    });
  });

  describe("skillSearchPaths", () => {
    it("returns workspace and global paths", () => {
      const paths = kiroAdapter.skillSearchPaths("/my/project");
      expect(paths).toHaveLength(2);
      expect(paths[0]).toEqual({
        path: "/my/project/.kiro/skills",
        source: "workspace",
      });
      expect(paths[1]).toMatchObject({ source: "global" });
      expect(paths[1].path).toContain(".kiro/skills");
    });
  });
});
