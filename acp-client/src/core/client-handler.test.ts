import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { ToolCall, ToolCallUpdate, Plan, AvailableCommand } from '@agentclientprotocol/sdk';
import { createClientHandler, defaultReadFile, defaultWriteFile } from './client-handler.js';
import type { ClientHandlerDeps } from './types.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockDeps, setupConnectionWithClientFactory } from '../__tests__/setup.js';

function setupConnection(deps: ClientHandlerDeps) {
  const createClient = createClientHandler(deps);
  return setupConnectionWithClientFactory(createClient);
}

describe('createClientHandler — sessionUpdate dispatch', () => {
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it.each([
    {
      name: 'agent_message_chunk',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } },
      callback: 'onMessageChunk',
      verify: (calls: unknown[][]) => { expect(calls[0][0]).toBe('sess-1'); expect(calls[0][2]).toBe('assistant'); },
    },
    {
      name: 'user_message_chunk',
      update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'user msg' } },
      callback: 'onMessageChunk',
      verify: (calls: unknown[][]) => { expect(calls[0][2]).toBe('user'); },
    },
    {
      name: 'tool_call',
      update: { sessionUpdate: 'tool_call', toolCallId: 'tc-1', title: 'Reading file', kind: 'read', status: 'in_progress' },
      callback: 'onToolCall',
      verify: (calls: unknown[][]) => { expect((calls[0][1] as ToolCall).toolCallId).toBe('tc-1'); },
    },
    {
      name: 'tool_call_update',
      update: { sessionUpdate: 'tool_call_update', toolCallId: 'tc-1', status: 'completed' },
      callback: 'onToolCallUpdate',
      verify: (calls: unknown[][]) => { expect((calls[0][1] as ToolCallUpdate).status).toBe('completed'); },
    },
    {
      name: 'plan',
      update: { sessionUpdate: 'plan', entries: [{ content: 'Step 1', status: 'pending', priority: 'high' }] },
      callback: 'onPlan',
      verify: (calls: unknown[][]) => { expect((calls[0][1] as Plan).entries).toHaveLength(1); },
    },
    {
      name: 'current_mode_update',
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'ask' },
      callback: 'onModeChange',
      verify: (calls: unknown[][]) => { expect(calls[0][1]).toBe('ask'); },
    },
    {
      name: 'available_commands_update',
      update: { sessionUpdate: 'available_commands_update', availableCommands: [{ name: 'compact', description: 'Compact context' }] },
      callback: 'onCommandsAvailable',
      verify: (calls: unknown[][]) => { expect((calls[0][1] as AvailableCommand[])[0].name).toBe('compact'); },
    },
    {
      name: 'usage_update',
      update: { sessionUpdate: 'usage_update', used: 5000, size: 200000 },
      callback: 'onUsageUpdate',
      verify: (calls: unknown[][]) => { expect(calls[0][1]).toBe(5000); expect(calls[0][2]).toBe(200000); },
    },
    {
      name: 'session_info_update',
      update: { sessionUpdate: 'session_info_update', title: 'My Session' },
      callback: 'onSessionInfo',
      verify: (calls: unknown[][]) => { expect(calls[0][1]).toBe('My Session'); },
    },
  ])('dispatches $name to $callback', async ({ update, callback, verify }) => {
    const { client, agentConn } = setupConnection(deps);
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'test', version: '1.0.0' },
      clientCapabilities: {},
    });

    await agentConn.sessionUpdate({ sessionId: 'sess-1', update: update as any });

    expect(deps.calls[callback]).toHaveLength(1);
    verify(deps.calls[callback]);
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

    const handle = await agentConn.createTerminal({ sessionId: 'sess-1', command: 'echo', args: ['hello'] });
    expect(handle.id).toBeTruthy();

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

    const handle = await agentConn.createTerminal({ sessionId: 'sess-1', command: 'sleep', args: ['60'] });
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

    const handle = await agentConn.createTerminal({ sessionId: 'sess-1', command: 'sleep', args: ['60'] });
    await handle.release();
    const output = await handle.currentOutput();
    expect(output.output).toBe('');
  });
});

describe('createClientHandler — extNotification', () => {
  it('delegates to onExtNotification callback', async () => {
    const extCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const deps = createMockDeps();
    deps.onExtNotification = async (method, params) => { extCalls.push({ method, params }); };

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

    await expect(agentConn.extNotification('_kiro.dev/metadata', { foo: 'bar' })).resolves.toBeUndefined();
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
    expect(await defaultReadFile(filePath)).toBe('line1\nline2\nline3');
  });

  it('reads from specific line with limit', async () => {
    const filePath = join(tmpDir, 'test.txt');
    writeFileSync(filePath, 'line1\nline2\nline3\nline4');
    expect(await defaultReadFile(filePath, 2, 2)).toBe('line2\nline3');
  });
});

describe('defaultWriteFile', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = join(tmpdir(), `weaver-test-${Date.now()}`); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates directories and writes file', async () => {
    const filePath = join(tmpDir, 'sub', 'dir', 'test.txt');
    await defaultWriteFile(filePath, 'hello world');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(filePath, 'utf-8')).toBe('hello world');
  });
});
