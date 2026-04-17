import type { WeaverEvent } from "./weaver-event";

export enum Harness {
  KIRO_CLI = "kiro-cli",
  CLAUDE_CODE = "claude-code",
}

export interface SkillSearchPath {
  path: string;
  source: "workspace" | "global";
}

export interface EventContext {
  sessionId: string;
  timestamp: string;
  pid?: number;
}

export interface HarnessAdapter {
  name: string;
  processName: string;
  providesSessionId: boolean;
  parseEvent(raw: unknown, context: EventContext): WeaverEvent;
  globalConfigDir(): string;
  skillSearchPaths(cwd: string): SkillSearchPath[];
  cleanupSession(session: { id: string; pid: number }): Promise<void>;
  loadAgentConfig?(
    agentName: string,
    cwd: string,
  ): Promise<Record<string, unknown> | null>;
  syncConfig?(
    cwd: string,
    options?: { dryRun?: boolean },
  ): { patched: string[]; skipped: string[]; errors: string[] };
}
