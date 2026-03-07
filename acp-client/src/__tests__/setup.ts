import {
  ClientSideConnection,
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';
import type {
  Client,
  Agent,
  RequestPermissionRequest,
  SessionNotification,
  PromptRequest,
  SessionModeState,
  PermissionOption,
} from '@agentclientprotocol/sdk';
import { PassThrough } from 'node:stream';
import type { ClientHandlerDeps } from '../core/types.js';

// --- Mock deps for client-handler tests ---

export function createMockDeps(): ClientHandlerDeps & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  function track(name: string) {
    calls[name] = calls[name] ?? [];
    return (...args: unknown[]) => { calls[name].push(args); };
  }

  return {
    calls,
    onMessageChunk: track('onMessageChunk') as ClientHandlerDeps['onMessageChunk'],
    onToolCall: track('onToolCall') as ClientHandlerDeps['onToolCall'],
    onToolCallUpdate: track('onToolCallUpdate') as ClientHandlerDeps['onToolCallUpdate'],
    onPlan: track('onPlan') as ClientHandlerDeps['onPlan'],
    onModeChange: track('onModeChange') as ClientHandlerDeps['onModeChange'],
    onCommandsAvailable: track('onCommandsAvailable') as ClientHandlerDeps['onCommandsAvailable'],
    onUsageUpdate: track('onUsageUpdate') as ClientHandlerDeps['onUsageUpdate'],
    onSessionInfo: track('onSessionInfo') as ClientHandlerDeps['onSessionInfo'],
    requestApproval: async (req: RequestPermissionRequest) => {
      track('requestApproval')(req);
      const option = req.options.find((o) => o.kind === 'allow_once');
      return { outcome: { outcome: 'selected' as const, optionId: option?.optionId ?? 'allow' } };
    },
    readFile: async (path: string) => {
      track('readFile')(path);
      return 'file content';
    },
    writeFile: async (path: string, content: string) => {
      track('writeFile')(path, content);
    },
  };
}

// --- Mock agent/client for connection tests ---

export function createMockAgent(): Agent {
  return {
    async initialize() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
        agentInfo: { name: 'mock-agent', version: '1.0.0' },
      };
    },
    async authenticate() {},
    async newSession() { return { sessionId: 'test-session' }; },
    async prompt() { return { stopReason: 'end_turn' as const }; },
    async cancel() {},
  };
}

export function createMockClient(): Client {
  return {
    async requestPermission() {
      return { outcome: { outcome: 'selected' as const, optionId: 'allow' } };
    },
    async sessionUpdate() {},
  };
}

// --- In-process ACP connection (for session manager tests) ---

export interface MockAgentOptions {
  sessionId?: string;
  modes?: SessionModeState;
  onPrompt?: (params: PromptRequest) => void;
  onCancel?: () => void;
  onSetMode?: (modeId: string) => void;
  onLoadSession?: () => void;
}

export function setupInProcessConnection(agentOpts: MockAgentOptions = {}) {
  const clientToAgent = new TransformStream();
  const agentToClient = new TransformStream();
  const sessionUpdates: SessionNotification[] = [];

  const client = new ClientSideConnection(
    (): Client => ({
      async requestPermission() {
        return { outcome: { outcome: 'selected' as const, optionId: 'allow' } };
      },
      async sessionUpdate(params: SessionNotification) {
        sessionUpdates.push(params);
      },
    }),
    ndJsonStream(clientToAgent.writable, agentToClient.readable),
  );

  const agentConn = new AgentSideConnection(
    (): Agent => ({
      async initialize() {
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, agentInfo: { name: 'mock-agent', version: '1.0.0' } };
      },
      async authenticate() {},
      async newSession() { return { sessionId: agentOpts.sessionId ?? 'agent-session-1', modes: agentOpts.modes }; },
      async loadSession() { agentOpts.onLoadSession?.(); return {}; },
      async prompt(params) { agentOpts.onPrompt?.(params); return { stopReason: 'end_turn' as const }; },
      async cancel() { agentOpts.onCancel?.(); },
      async setSessionMode(params) { agentOpts.onSetMode?.(params.modeId); },
    }),
    ndJsonStream(agentToClient.writable, clientToAgent.readable),
  );

  return { client, agentConn, sessionUpdates };
}

// --- Connection with custom client factory (for client-handler tests) ---

export function setupConnectionWithClientFactory(createClient: (agent: Agent) => Client) {
  const clientToAgent = new TransformStream();
  const agentToClient = new TransformStream();

  const client = new ClientSideConnection(
    (agent) => createClient(agent),
    ndJsonStream(clientToAgent.writable, agentToClient.readable),
  );

  const agentConn = new AgentSideConnection(
    (): Agent => ({
      async initialize() {
        return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {}, agentInfo: { name: 'mock-agent', version: '1.0.0' } };
      },
      async authenticate() {},
      async newSession() { return { sessionId: 'sess-1' }; },
      async prompt() { return { stopReason: 'end_turn' as const }; },
      async cancel() {},
    }),
    ndJsonStream(agentToClient.writable, clientToAgent.readable),
  );

  return { client, agentConn };
}

// --- Approval test helpers ---

export function makePermissionOptions(): PermissionOption[] {
  return [
    { optionId: 'opt-allow', kind: 'allow_once', name: 'Allow once' },
    { optionId: 'opt-trust', kind: 'allow_always', name: 'Trust always' },
    { optionId: 'opt-reject', kind: 'reject_once', name: 'Reject once' },
  ];
}

export function makePermissionRequest(overrides: Partial<RequestPermissionRequest> = {}): RequestPermissionRequest {
  return {
    sessionId: 'sess-1',
    toolCall: { toolCallId: 'tc-1', title: 'Write to file.ts', kind: 'edit' },
    options: makePermissionOptions(),
    ...overrides,
  };
}

export function simulateInput(answer: string): PassThrough {
  const input = new PassThrough();
  queueMicrotask(() => input.write(answer + '\n'));
  return input;
}
