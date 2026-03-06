import { randomUUID } from 'node:crypto';
import type { SessionId, ContentBlock, PromptResponse, McpServer } from '@agentclientprotocol/sdk';
import type { SessionManager, SessionManagerOptions, CreateSessionResult } from './types.js';

export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const { agent, db, agentName, pid } = options;

  return {
    async createSession(cwd: string, mcpServers: McpServer[]): Promise<CreateSessionResult> {
      const response = await agent.newSession({ cwd, mcpServers });
      const internalId = randomUUID();
      const now = new Date().toISOString();

      db.createSession({
        id: internalId,
        agent_session_id: response.sessionId,
        pid: pid ?? null,
        cwd,
        agent_name: agentName ?? null,
        custom_name: null,
        model: null,
        status: 'open',
        context_usage_percent: null,
        created_at: now,
      });

      db.appendEvent({
        session_id: internalId,
        event_type: 'session_start',
        data: JSON.stringify({ agentSessionId: response.sessionId, cwd }),
        created_at: now,
      });

      return {
        sessionId: response.sessionId,
        internalId,
        modes: response.modes,
      };
    },

    async loadSession(sessionId: SessionId, cwd: string, mcpServers: McpServer[]): Promise<void> {
      await agent.loadSession({ sessionId, cwd, mcpServers });
    },

    async sendPrompt(sessionId: SessionId, content: ContentBlock[]): Promise<PromptResponse> {
      return agent.prompt({ sessionId, prompt: content });
    },

    async cancel(sessionId: SessionId): Promise<void> {
      await agent.cancel({ sessionId });
    },

    async setMode(sessionId: SessionId, modeId: string): Promise<void> {
      await agent.setSessionMode({ sessionId, modeId });
    },
  };
}
