import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ClientSideConnection,
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';
import type {
  Client,
  Agent,
  ContentChunk,
  ToolCall,
  ToolCallUpdate,
  Plan,
  AvailableCommand,
  RequestPermissionRequest,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import { createClientHandler, defaultReadFile, defaultWriteFile } from './client-handler.js';
import type { ClientHandlerDeps } from './types.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createMockDeps(): ClientHandlerDeps & {
  calls: Record<string, unknown[][]>;
} {
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

function setupConnection(deps: ClientHandlerDeps) {
  const clientToAgent = new TransformStream();
  const agentToClient = new TransformStream();

  let agentConn: AgentSideConnection;

  const createClient = createClientHandler(deps);

  const client = new ClientSideConnection(
    (agent) => createClient(agent),
    ndJsonStream(clientToAgent.writable, agentToClient.readable),
  );

  agentConn = new AgentSideConnection(
    (conn): Agent => ({
      async initialize() {
        return {
          protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: {},
          agentInfo: { name: 'mock-agent', version: '1.0.0' },
        };
      },
      async authenticate() {},
      async newSession() {
        return { sessionId: 'sess-1' };
      },
      async prompt() {
        return { stopReason: 'end_turn' as const };
      },
      async cancel() {},
    }),
    ndJsonStream(agentToClient.writable, clientToAgent.readable),
  );

  return { client, agentConn };
}

describe('createClientHandler — sessionUpdate dispatch', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('dispatches agent_message_chunk to onMessageChunk', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hello' },
      },
    });

    expect(deps.calls['onMessageChunk']).toHaveLength(1);
    expect(deps.calls['onMessageChunk'][0][0]).toBe('sess-1');
    expect(deps.calls['onMessageChunk'][0][2]).toBe('assistant');
  });

  it('dispatches user_message_chunk to onMessageChunk with user role', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'user msg' },
      },
    });

    expect(deps.calls['onMessageChunk']).toHaveLength(1);
    expect(deps.calls['onMessageChunk'][0][2]).toBe('user');
  });

  it('dispatches tool_call to onToolCall', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tc-1',
        title: 'Reading file',
        kind: 'read',
        status: 'in_progress',
      },
    });

    expect(deps.calls['onToolCall']).toHaveLength(1);
    expect((deps.calls['onToolCall'][0][1] as ToolCall).toolCallId).toBe('tc-1');
  });

  it('dispatches tool_call_update to onToolCallUpdate', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tc-1',
        status: 'completed',
      },
    });

    expect(deps.calls['onToolCallUpdate']).toHaveLength(1);
    expect((deps.calls['onToolCallUpdate'][0][1] as ToolCallUpdate).status).toBe('completed');
  });

  it('dispatches plan to onPlan', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'plan',
        entries: [{ content: 'Step 1', status: 'pending', priority: 'high' }],
      },
    });

    expect(deps.calls['onPlan']).toHaveLength(1);
    expect((deps.calls['onPlan'][0][1] as Plan).entries).toHaveLength(1);
  });

  it('dispatches current_mode_update to onModeChange', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'current_mode_update',
        currentModeId: 'ask',
      },
    });

    expect(deps.calls['onModeChange']).toHaveLength(1);
    expect(deps.calls['onModeChange'][0][1]).toBe('ask');
  });

  it('dispatches available_commands_update to onCommandsAvailable', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [{ name: 'compact', description: 'Compact context' }],
      },
    });

    expect(deps.calls['onCommandsAvailable']).toHaveLength(1);
    expect((deps.calls['onCommandsAvailable'][0][1] as AvailableCommand[])[0].name).toBe('compact');
  });

  it('dispatches usage_update to onUsageUpdate', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'usage_update',
        used: 5000,
        size: 200000,
      },
    });

    expect(deps.calls['onUsageUpdate']).toHaveLength(1);
    expect(deps.calls['onUsageUpdate'][0][1]).toBe(5000);
    expect(deps.calls['onUsageUpdate'][0][2]).toBe(200000);
  });

  it('dispatches session_info_update to onSessionInfo', async () => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({
      sessionId: 'sess-1',
      update: {
        sessionUpdate: 'session_info_update',
        title: 'My Session',
      },
    });

    expect(deps.calls['onSessionInfo']).toHaveLength(1);
    expect(deps.calls['onSessionInfo'][0][1]).toBe('My Session');
  });
});

describe('createClientHandler — requestPermission', () => {
  it('delegates to requestApproval and returns response', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    const response = await agentConn.requestPermission({
      sessionId: 'sess-1',
      toolCall: { toolCallId: 'tc-1', title: 'Write file', status: 'pending' },
      options: [
        { optionId: 'allow', kind: 'allow_once', name: 'Allow' },
        { optionId: 'reject', kind: 'reject_once', name: 'Reject' },
      ],
    });

    expect(response.outcome).toEqual({ outcome: 'selected', optionId: 'allow' });
    expect(deps.calls['requestApproval']).toHaveLength(1);
  });
});

describe('createClientHandler — fs operations', () => {
  it('readTextFile delegates to readFile dep', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    });

    const response = await agentConn.readTextFile({ sessionId: 'sess-1', path: '/tmp/test.txt' });

    expect(response.content).toBe('file content');
    expect(deps.calls['readFile']).toHaveLength(1);
  });

  it('writeTextFile delegates to writeFile dep', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
    });

    await agentConn.writeTextFile({ sessionId: 'sess-1', path: '/tmp/test.txt', content: 'hello' });

    expect(deps.calls['writeFile']).toHaveLength(1);
    expect(deps.calls['writeFile'][0]).toEqual(['/tmp/test.txt', 'hello']);
  });
});

describe('createClientHandler — terminal operations', () => {
  it('createTerminal spawns a process and returns terminalId', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: { terminal: true },
    });

    const handle = await agentConn.createTerminal({
      sessionId: 'sess-1',
      command: 'echo',
      args: ['hello'],
    });

    expect(handle.id).toBeTruthy();

    // Wait for the process to finish and check output
    const exitResult = await handle.waitForExit();
    expect(exitResult.exitCode).toBe(0);

    const output = await handle.currentOutput();
    expect(output.output).toContain('hello');

    await handle.release();
  });

  it('killTerminal sends SIGTERM to running process', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: { terminal: true },
    });

    const handle = await agentConn.createTerminal({
      sessionId: 'sess-1',
      command: 'sleep',
      args: ['60'],
    });

    await handle.kill();
    const exitResult = await handle.waitForExit();
    expect(exitResult.exitCode).toBeNull();

    await handle.release();
  });

  it('releaseTerminal kills and cleans up', async () => {
    const deps = createMockDeps();
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: { terminal: true },
    });

    const handle = await agentConn.createTerminal({
      sessionId: 'sess-1',
      command: 'sleep',
      args: ['60'],
    });

    await handle.release();

    // After release, output should return empty
    const output = await handle.currentOutput();
    expect(output.output).toBe('');
  });
});

describe('createClientHandler — extNotification', () => {
  it('delegates to onExtNotification callback', async () => {
    const extCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const deps = createMockDeps();
    deps.onExtNotification = async (method, params) => {
      extCalls.push({ method, params });
    };

    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.extNotification('_kiro.dev/metadata', { contextUsagePercentage: 42 });

    expect(extCalls).toHaveLength(1);
    expect(extCalls[0].method).toBe('_kiro.dev/metadata');
    expect(extCalls[0].params).toEqual({ contextUsagePercentage: 42 });
  });

  it('does not throw when onExtNotification is not provided', async () => {
    const deps = createMockDeps();
    delete deps.onExtNotification;

    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await expect(
      agentConn.extNotification('_kiro.dev/metadata', { foo: 'bar' }),
    ).resolves.toBeUndefined();
  });
});

describe('defaultReadFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `weaver-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads entire file when no line/limit specified', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'line1\nline2\nline3');

    const content = await defaultReadFile(filePath);
    expect(content).toBe('line1\nline2\nline3');
  });

  it('reads from specific line with limit', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'line1\nline2\nline3\nline4');

    const content = await defaultReadFile(filePath, 2, 2);
    expect(content).toBe('line2\nline3');
  });
});

describe('defaultWriteFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `weaver-test-${Date.now()}`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates directories and writes file', async () => {
    const filePath = join(tmpDir, 'sub', 'dir', 'test.txt');
    await defaultWriteFile(filePath, 'hello world');

    const { readFileSync } = await import('node:fs');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });
});
