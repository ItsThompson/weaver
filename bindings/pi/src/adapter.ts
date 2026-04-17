import { join } from "node:path";
import { homedir } from "node:os";
import type {
  HarnessAdapter,
  EventContext,
  SkillSearchPath,
} from "@weaver/shared/types";
import { Harness, WeaverEventName, resolveToolName } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";
import { loadAgentConfig } from "./skills/agent-config";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  "session-start": WeaverEventName.AGENT_SPAWN,
  stop: WeaverEventName.STOP,
  "pre-tool-use": WeaverEventName.PRE_TOOL_USE,
  "post-tool-use": WeaverEventName.POST_TOOL_USE,
  "user-prompt-submit": WeaverEventName.USER_PROMPT_SUBMIT,
  validation: WeaverEventName.VALIDATION,
};

export const piAdapter: HarnessAdapter = {
  name: Harness.PI,
  processName: "pi",
  providesSessionId: true,

  parseEvent(raw: unknown, context: EventContext): WeaverEvent {
    const data = raw as Record<string, unknown>;
    const hookName = String(data.hook_event_name ?? "");
    const eventName = EVENT_NAME_MAP[hookName];
    if (!eventName) {
      throw new Error(`Unknown pi event: "${hookName}"`);
    }

    return {
      sessionId: String(data.session_id ?? context.sessionId),
      timestamp: context.timestamp,
      harness: Harness.PI,
      eventName,
      cwd: String(data.cwd ?? ""),
      pid: context.pid,
      prompt: data.prompt ? String(data.prompt) : undefined,
      toolName: data.tool_name
        ? resolveToolName(String(data.tool_name))
        : undefined,
      toolInput: data.tool_input as Record<string, unknown> | undefined,
      toolResponse: data.tool_response as
        | { success: boolean; result: unknown[] }
        | undefined,
      raw: data,
    };
  },

  globalConfigDir(): string {
    return join(homedir(), ".pi", "agent");
  },

  skillSearchPaths(cwd: string): SkillSearchPath[] {
    return [
      { path: join(cwd, ".pi", "skills"), source: "workspace" },
      { path: join(homedir(), ".pi", "agent", "skills"), source: "global" },
    ];
  },

  async cleanupSession(): Promise<void> {
    // Pi manages its own sessions natively. No marker files to clean up.
  },

  loadAgentConfig,
};
