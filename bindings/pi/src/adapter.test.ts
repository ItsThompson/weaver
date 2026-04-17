import { describe, it, expect } from "vitest";
import { piAdapter } from "./adapter";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { EventContext } from "@weaver/shared/types";

const context: EventContext = {
  sessionId: "fallback-session",
  timestamp: "2026-01-01T00:00:00Z",
  pid: 12345,
};

describe("piAdapter", () => {
  it("has correct metadata", () => {
    expect(piAdapter.name).toBe(Harness.PI);
    expect(piAdapter.processName).toBe("pi");
    expect(piAdapter.providesSessionId).toBe(true);
  });

  describe("parseEvent", () => {
    it("maps session-start and uses native session_id", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "session-start",
          session_id: "pi-session-abc",
          cwd: "/project",
        },
        context,
      );
      expect(event).toMatchObject({
        sessionId: "pi-session-abc",
        timestamp: "2026-01-01T00:00:00Z",
        harness: Harness.PI,
        eventName: WeaverEventName.AGENT_SPAWN,
        cwd: "/project",
        pid: 12345,
      });
    });

    it("maps stop", () => {
      const event = piAdapter.parseEvent(
        { hook_event_name: "stop", session_id: "s1", cwd: "/project" },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.STOP);
    });

    it("maps pre-tool-use with tool fields", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "pre-tool-use",
          session_id: "s1",
          cwd: "/project",
          tool_name: "read",
          tool_input: { path: "/file.ts" },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.PRE_TOOL_USE);
      expect(event.toolName).toBe("read");
      expect(event.toolInput).toEqual({ path: "/file.ts" });
    });

    it("maps post-tool-use and resolves tool name to canonical", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "post-tool-use",
          session_id: "s1",
          cwd: "/project",
          tool_name: "write",
          tool_input: { path: "/file.ts", content: "hello" },
          tool_response: { success: true, result: ["ok"] },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.POST_TOOL_USE);
      expect(event.toolName).toBe("write");
      expect(event.toolInput).toEqual({ path: "/file.ts", content: "hello" });
      expect(event.toolResponse).toEqual({ success: true, result: ["ok"] });
    });

    it("maps user-prompt-submit with prompt", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "user-prompt-submit",
          session_id: "s1",
          cwd: "/project",
          prompt: "fix the bug",
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.USER_PROMPT_SUBMIT);
      expect(event.prompt).toBe("fix the bug");
    });

    it("passes through unknown tool names unchanged", () => {
      const event = piAdapter.parseEvent(
        {
          hook_event_name: "post-tool-use",
          session_id: "s1",
          cwd: "/project",
          tool_name: "mcp_builder_mcp__InternalSearch",
        },
        context,
      );
      expect(event.toolName).toBe("mcp_builder_mcp__InternalSearch");
    });

    it("throws for unknown event name", () => {
      expect(() =>
        piAdapter.parseEvent(
          { hook_event_name: "unknownEvent", session_id: "s1", cwd: "/" },
          context,
        ),
      ).toThrow('Unknown pi event: "unknownEvent"');
    });

    it("falls back to context sessionId when session_id missing", () => {
      const event = piAdapter.parseEvent(
        { hook_event_name: "stop", cwd: "/project" },
        context,
      );
      expect(event.sessionId).toBe("fallback-session");
    });

    it("omits undefined optional fields", () => {
      const event = piAdapter.parseEvent(
        { hook_event_name: "stop", session_id: "s1", cwd: "/project" },
        context,
      );
      expect(event.prompt).toBeUndefined();
      expect(event.toolName).toBeUndefined();
      expect(event.toolInput).toBeUndefined();
      expect(event.toolResponse).toBeUndefined();
    });

    it("preserves raw payload", () => {
      const raw = {
        hook_event_name: "stop",
        session_id: "s1",
        cwd: "/project",
        custom_field: "extra",
      };
      const event = piAdapter.parseEvent(raw, context);
      expect(event.raw).toBe(raw);
    });
  });

  describe("skillSearchPaths", () => {
    it("returns workspace and global .pi paths", () => {
      const paths = piAdapter.skillSearchPaths("/my/project");
      expect(paths).toHaveLength(2);
      expect(paths[0]).toEqual({
        path: "/my/project/.pi/skills",
        source: "workspace",
      });
      expect(paths[1]).toMatchObject({ source: "global" });
      expect(paths[1].path).toContain(".pi/agent/skills");
    });
  });

  describe("cleanupSession", () => {
    it("is a no-op", async () => {
      await expect(
        piAdapter.cleanupSession({ id: "s1", pid: 123 }),
      ).resolves.toBeUndefined();
    });
  });
});
