import { join } from "node:path";
import { homedir } from "node:os";
import type {
  HarnessAdapter,
  EventContext,
  SkillSearchPath,
} from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  SessionStart: WeaverEventName.SESSION_START,
  SessionEnd: WeaverEventName.SESSION_END,
  Stop: WeaverEventName.STOP,
  PreToolUse: WeaverEventName.PRE_TOOL_USE,
  PostToolUse: WeaverEventName.POST_TOOL_USE,
  UserPromptSubmit: WeaverEventName.USER_PROMPT_SUBMIT,
  SubagentStart: WeaverEventName.SUBAGENT_START,
  SubagentStop: WeaverEventName.SUBAGENT_STOP,
  Notification: WeaverEventName.NOTIFICATION,
  PostToolUseFailure: WeaverEventName.POST_TOOL_USE_FAILURE,
  PermissionRequest: WeaverEventName.PERMISSION_REQUEST,
  PermissionDenied: WeaverEventName.PERMISSION_DENIED,
  TaskCreated: WeaverEventName.TASK_CREATED,
  TaskCompleted: WeaverEventName.TASK_COMPLETED,
  StopFailure: WeaverEventName.STOP_FAILURE,
  TeammateIdle: WeaverEventName.TEAMMATE_IDLE,
  ConfigChange: WeaverEventName.CONFIG_CHANGE,
  PreCompact: WeaverEventName.PRE_COMPACT,
  PostCompact: WeaverEventName.POST_COMPACT,
};

function normalizeToolResponse(
  raw: unknown,
): { success: boolean; result: unknown[] } | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if ("success" in obj && "result" in obj && Array.isArray(obj.result)) {
    return { success: Boolean(obj.success), result: obj.result };
  }
  // Infer success from common failure indicators when shape is non-standard
  const hasFailureSignal =
    ("exit_code" in obj && obj.exit_code !== 0) || "error" in obj;
  return { success: !hasFailureSignal, result: [raw] };
}

export const claudeCodeAdapter: HarnessAdapter = {
  name: Harness.CLAUDE_CODE,
  processName: "claude",
  providesSessionId: true,

  parseEvent(raw: unknown, context: EventContext): WeaverEvent {
    // TODO: Add a typed schema (e.g., Zod) when the Claude Code hook contract stabilizes.
    // Currently uses untyped Record access: field name typos are silent.
    const data = raw as Record<string, unknown>;
    const hookName = String(data.hook_event_name ?? "");
    const eventName = EVENT_NAME_MAP[hookName];
    if (!eventName) {
      throw new Error(`Unknown Claude Code event: "${hookName}"`);
    }

    return {
      sessionId: String(data.session_id ?? context.sessionId),
      timestamp: context.timestamp,
      harness: Harness.CLAUDE_CODE,
      eventName,
      cwd: String(data.cwd ?? ""),
      pid: context.pid,
      transcriptPath: data.transcript_path
        ? String(data.transcript_path)
        : undefined,
      prompt: data.prompt ? String(data.prompt) : undefined,
      toolName: data.tool_name ? String(data.tool_name) : undefined,
      toolInput: data.tool_input as Record<string, unknown> | undefined,
      toolResponse: normalizeToolResponse(data.tool_response),
      permissionMode: data.permission_mode
        ? String(data.permission_mode)
        : undefined,
      raw: data,
    };
  },

  globalConfigDir(): string {
    return join(homedir(), ".claude");
  },

  skillSearchPaths(cwd: string): SkillSearchPath[] {
    return [
      { path: join(cwd, ".claude", "skills"), source: "workspace" },
      { path: join(homedir(), ".claude", "skills"), source: "global" },
    ];
  },

  async cleanupSession(): Promise<void> {
    // No marker files for Claude Code (uses native session IDs)
  },
};
