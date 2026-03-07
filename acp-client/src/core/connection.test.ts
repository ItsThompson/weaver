import { describe, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { ClientSideConnection, AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { connect } from './connection.js';
import type { ConnectionOptions } from './types.js';
import { createMockAgent, createMockClient } from '../__tests__/setup.js';

describe('ACP initialize handshake', () => {
  it('completes initialization and returns agent capabilities', async () => {
    const clientToAgent = new TransformStream();
    const agentToClient = new TransformStream();

    const client = new ClientSideConnection(
      () => createMockClient(),
      ndJsonStream(clientToAgent.writable, agentToClient.readable),
    );
    new AgentSideConnection(
      () => createMockAgent(),
      ndJsonStream(agentToClient.writable, clientToAgent.readable),
    );

    const result = await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    });

    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(result.agentCapabilities?.loadSession).toBe(true);
    expect(result.agentInfo?.name).toBe('mock-agent');
  });

  it('advertises fs and terminal capabilities to the agent', async () => {
    let receivedCapabilities: unknown = null;

    const clientToAgent = new TransformStream();
    const agentToClient = new TransformStream();

    const client = new ClientSideConnection(
      () => createMockClient(),
      ndJsonStream(clientToAgent.writable, agentToClient.readable),
    );
    new AgentSideConnection(
      () => ({
        ...createMockAgent(),
        async initialize(params) {
          receivedCapabilities = params.clientCapabilities;
          return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: {} };
        },
      }),
      ndJsonStream(agentToClient.writable, clientToAgent.readable),
    );

    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    });

    expect(receivedCapabilities).toMatchObject({
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    });
  });

  it('connection signal aborts when stream closes', async () => {
    const clientToAgent = new TransformStream();
    const agentToClient = new TransformStream();

    const client = new ClientSideConnection(
      () => createMockClient(),
      ndJsonStream(clientToAgent.writable, agentToClient.readable),
    );
    new AgentSideConnection(
      () => createMockAgent(),
      ndJsonStream(agentToClient.writable, clientToAgent.readable),
    );

    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    expect(client.signal.aborted).toBe(false);
    await agentToClient.writable.close();
    await client.closed;
    expect(client.signal.aborted).toBe(true);
  });
});

describe('connect', () => {
  it('throws when agent command does not exist', async () => {
    const options: ConnectionOptions = {
      agentCommand: '/nonexistent/binary',
      agentArgs: ['acp'],
      clientInfo: { name: 'weaver', version: '1.0.0' },
      createClient: () => createMockClient(),
    };

    await expect(connect(options)).rejects.toThrow();
  });

  it('shutdown terminates a running child process', async () => {
    const child = spawn('sleep', ['60']);
    const pid = child.pid!;

    expect(() => process.kill(pid, 0)).not.toThrow();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });

    expect(() => process.kill(pid, 0)).toThrow();
  });
});
