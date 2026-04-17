import { describe, it, expect } from "vitest";
import { claudeCodeAdapter } from "./adapter";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { EventContext } from "@weaver/shared/types";

const context: EventContext = {
  sessionId: "fallback-session",
  timestamp: "2026-01-01T00:00:00Z",
  pid: 99999,
};

describe("claudeCodeAdapter", () => {
  it("has correct metadata", () => {
    expect(claudeCodeAdapter.name).toBe(Harness.CLAUDE_CODE);
    expect(claudeCodeAdapter.processName).toBe("claude");
    expect(claudeCodeAdapter.providesSessionId).toBe(true);
  });

  describe("parseEvent", () => {
    it("maps SessionStart and uses native session_id", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "SessionStart",
          session_id: "cc-session-abc",
          cwd: "/project",
          transcript_path: "/tmp/transcript.md",
        },
        context,
      );
      expect(event).toMatchObject({
        sessionId: "cc-session-abc",
        timestamp: "2026-01-01T00:00:00Z",
        harness: Harness.CLAUDE_CODE,
        eventName: WeaverEventName.SESSION_START,
        cwd: "/project",
        pid: 99999,
        transcriptPath: "/tmp/transcript.md",
      });
    });

    it("maps UserPromptSubmit with prompt", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "UserPromptSubmit",
          session_id: "s1",
          cwd: "/project",
          prompt: "fix the bug",
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.USER_PROMPT_SUBMIT);
      expect(event.prompt).toBe("fix the bug");
    });

    it("maps PreToolUse with tool fields", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PreToolUse",
          session_id: "s1",
          cwd: "/project",
          tool_name: "Read",
          tool_input: { file_path: "/file.ts" },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.PRE_TOOL_USE);
      expect(event.toolName).toBe("Read");
      expect(event.toolInput).toEqual({ file_path: "/file.ts" });
    });

    it("maps PostToolUse and normalizes standard tool response", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PostToolUse",
          session_id: "s1",
          cwd: "/project",
          tool_name: "Write",
          tool_response: { success: true, result: ["ok"] },
        },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.POST_TOOL_USE);
      expect(event.toolResponse).toEqual({ success: true, result: ["ok"] });
    });

    it("wraps non-standard tool response", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PostToolUse",
          session_id: "s1",
          cwd: "/project",
          tool_name: "Bash",
          tool_response: { stdout: "hello", exit_code: 0 },
        },
        context,
      );
      expect(event.toolResponse).toEqual({
        success: true,
        result: [{ stdout: "hello", exit_code: 0 }],
      });
    });

    it("infers failure from non-zero exit_code", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PostToolUse",
          session_id: "s1",
          cwd: "/project",
          tool_name: "Bash",
          tool_response: { stdout: "", exit_code: 1 },
        },
        context,
      );
      expect(event.toolResponse).toEqual({
        success: false,
        result: [{ stdout: "", exit_code: 1 }],
      });
    });

    it("infers failure from error field", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PostToolUse",
          session_id: "s1",
          cwd: "/project",
          tool_name: "Read",
          tool_response: { error: "file not found" },
        },
        context,
      );
      expect(event.toolResponse).toEqual({
        success: false,
        result: [{ error: "file not found" }],
      });
    });

    it("maps Stop", () => {
      const event = claudeCodeAdapter.parseEvent(
        { hook_event_name: "Stop", session_id: "s1", cwd: "/project" },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.STOP);
    });

    it("maps SessionEnd", () => {
      const event = claudeCodeAdapter.parseEvent(
        { hook_event_name: "SessionEnd", session_id: "s1", cwd: "/project" },
        context,
      );
      expect(event.eventName).toBe(WeaverEventName.SESSION_END);
    });

    it("maps permission_mode", () => {
      const event = claudeCodeAdapter.parseEvent(
        {
          hook_event_name: "PreToolUse",
          session_id: "s1",
          cwd: "/project",
          permission_mode: "auto",
        },
        context,
      );
      expect(event.permissionMode).toBe("auto");
    });

    it("preserves raw payload", () => {
      const raw = {
        hook_event_name: "Stop",
        session_id: "s1",
        cwd: "/project",
        custom_field: "extra",
      };
      const event = claudeCodeAdapter.parseEvent(raw, context);
      expect(event.raw).toBe(raw);
    });

    it("throws for unknown event name", () => {
      expect(() =>
        claudeCodeAdapter.parseEvent(
          { hook_event_name: "UnknownEvent", session_id: "s1", cwd: "/" },
          context,
        ),
      ).toThrow('Unknown Claude Code event: "UnknownEvent"');
    });

    it("falls back to context sessionId when session_id missing", () => {
      const event = claudeCodeAdapter.parseEvent(
        { hook_event_name: "Stop", cwd: "/project" },
        context,
      );
      expect(event.sessionId).toBe("fallback-session");
    });

    it("omits undefined optional fields", () => {
      const event = claudeCodeAdapter.parseEvent(
        { hook_event_name: "Stop", session_id: "s1", cwd: "/project" },
        context,
      );
      expect(event.prompt).toBeUndefined();
      expect(event.toolName).toBeUndefined();
      expect(event.toolInput).toBeUndefined();
      expect(event.toolResponse).toBeUndefined();
      expect(event.transcriptPath).toBeUndefined();
      expect(event.permissionMode).toBeUndefined();
    });
  });

  describe("skillSearchPaths", () => {
    it("returns workspace and global .claude paths", () => {
      const paths = claudeCodeAdapter.skillSearchPaths("/my/project");
      expect(paths).toHaveLength(2);
      expect(paths[0]).toEqual({
        path: "/my/project/.claude/skills",
        source: "workspace",
      });
      expect(paths[1]).toMatchObject({ source: "global" });
      expect(paths[1].path).toContain(".claude/skills");
    });
  });

  describe("cleanupSession", () => {
    it("is a no-op", async () => {
      await expect(
        claudeCodeAdapter.cleanupSession({ id: "s1", pid: 123 }),
      ).resolves.toBeUndefined();
    });
  });

  describe("loadAgentConfig", () => {
    it("is attached to the adapter", () => {
      expect(claudeCodeAdapter.loadAgentConfig).toBeDefined();
      expect(typeof claudeCodeAdapter.loadAgentConfig).toBe("function");
    });
  });
});
