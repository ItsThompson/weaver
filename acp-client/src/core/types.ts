import type {
  Agent,
  InitializeResponse,
  Client,
  ClientSideConnection,
  SessionId,
  ContentBlock,
  ContentChunk,
  PromptResponse,
  SessionModeState,
  McpServer,
  ToolCall,
  ToolCallUpdate,
  Plan,
  AvailableCommand,
  RequestPermissionRequest,
  RequestPermissionResponse,
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

export interface ClientHandlerDeps {
  onMessageChunk: (sessionId: string, chunk: ContentChunk, role: 'user' | 'assistant') => void;
  onToolCall: (sessionId: string, toolCall: ToolCall) => void;
  onToolCallUpdate: (sessionId: string, update: ToolCallUpdate) => void;
  onPlan: (sessionId: string, plan: Plan) => void;
  onModeChange: (sessionId: string, modeId: string) => void;
  onCommandsAvailable: (sessionId: string, commands: AvailableCommand[]) => void;
  onUsageUpdate: (sessionId: string, used: number, size: number) => void;
  onSessionInfo: (sessionId: string, title?: string | null) => void;
  requestApproval: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  readFile: (path: string, line?: number | null, limit?: number | null) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  onExtNotification?: (method: string, params: Record<string, unknown>) => Promise<void>;
}
