import type {
  Agent,
  InitializeResponse,
  Client,
  ClientSideConnection,
  SessionId,
  ContentBlock,
  PromptResponse,
  SessionModeState,
  McpServer,
} from '@agentclientprotocol/sdk';
import type { WeaverDb } from '@weaver/shared/db';

export interface ConnectionOptions {
  agentCommand: string;
  agentArgs: string[];
  clientInfo: { name: string; version: string };
  createClient: (agent: Agent) => Client;
}

export interface ActiveConnection {
  agent: ClientSideConnection;
  capabilities: InitializeResponse;
  pid: number;
  shutdown: () => Promise<void>;
}

export interface SessionManagerOptions {
  agent: ClientSideConnection;
  db: WeaverDb;
  agentName?: string;
  pid?: number;
}

export interface CreateSessionResult {
  sessionId: SessionId;
  internalId: string;
  modes?: SessionModeState | null;
}

export interface SessionManager {
  createSession(cwd: string, mcpServers: McpServer[]): Promise<CreateSessionResult>;
  loadSession(sessionId: SessionId, cwd: string, mcpServers: McpServer[]): Promise<void>;
  sendPrompt(sessionId: SessionId, content: ContentBlock[]): Promise<PromptResponse>;
  cancel(sessionId: SessionId): Promise<void>;
  setMode(sessionId: SessionId, modeId: string): Promise<void>;
}
