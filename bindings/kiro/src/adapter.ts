import { join } from "node:path";
import { homedir } from "node:os";
import { unlinkSync } from "node:fs";
import type {
  HarnessAdapter,
  EventContext,
  SkillSearchPath,
} from "@weaver/shared/types";
import { Harness, WeaverEventName } from "@weaver/shared/types";
import type { WeaverEvent } from "@weaver/shared/types";
import type { HookEventData } from "@weaver/shared/types";
import { sessionMarkerPath } from "@weaver/shared/paths";
import { loadAgentConfig } from "./skills/agent-config";

const EVENT_NAME_MAP: Record<string, WeaverEventName> = {
  agentSpawn: WeaverEventName.AGENT_SPAWN,
  stop: WeaverEventName.STOP,
  preToolUse: WeaverEventName.PRE_TOOL_USE,
  postToolUse: WeaverEventName.POST_TOOL_USE,
  userPromptSubmit: WeaverEventName.USER_PROMPT_SUBMIT,
  validation: WeaverEventName.VALIDATION,
};

export const kiroAdapter: HarnessAdapter = {
  name: Harness.KIRO_CLI,
  processName: "kiro-cli",
  providesSessionId: false,

  parseEvent(raw: unknown, context: EventContext): WeaverEvent {
    const data = raw as HookEventData;
    const eventName = EVENT_NAME_MAP[data.hook_event_name];
    if (!eventName) {
      throw new Error(`Unknown kiro-cli event: "${data.hook_event_name}"`);
    }
    return {
      sessionId: context.sessionId,
      timestamp: context.timestamp,
      harness: Harness.KIRO_CLI,
      eventName,
      cwd: data.cwd,
      pid: context.pid,
      prompt: data.prompt,
      toolName: data.tool_name,
      toolInput: data.tool_input,
      toolResponse: data.tool_response,
    };
  },

  globalConfigDir(): string {
    return join(homedir(), ".kiro");
  },

  skillSearchPaths(cwd: string): SkillSearchPath[] {
    return [
      { path: join(cwd, ".kiro", "skills"), source: "workspace" },
      { path: join(homedir(), ".kiro", "skills"), source: "global" },
    ];
  },

  async cleanupSession(session: { id: string; pid: number }): Promise<void> {
    try {
      unlinkSync(sessionMarkerPath(session.pid));
    } catch {
      // Marker file may already be gone
    }
  },

  loadAgentConfig,
};
