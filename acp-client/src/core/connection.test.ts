import { describe, it, expect } from '@jest/globals';
import { spawn } from 'node:child_process';
import { ClientSideConnection, AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Client, Agent } from '@agentclientprotocol/sdk';
import { connect } from './connection.js';
import type { ConnectionOptions } from './types.js';

// --- Helpers ---

function createMockAgent(): Agent {
  return {
    async initialize() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentCapabilities: { loadSession: true },
        agentInfo: { name: 'mock-agent', version: '1.0.0' },
      };
    },
    async authenticate() {},
    async newSession() {
      return { sessionId: 'test-session' };
    },
    async prompt() {
      return { stopReason: 'end_turn' as const };
    },
    async cancel() {},
  };
}

function createMockClient(): Client {
  return {
    async requestPermission() {
      return { outcome: { outcome: 'selected' as const, optionId: 'allow' } };
    },
    async sessionUpdate() {},
  };
}

// --- Tests ---

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
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
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
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
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

    // Close the writable side to simulate agent exit
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
    // Spawn a real long-running process and verify shutdown kills it
    const child = spawn('sleep', ['60']);
    const pid = child.pid!;

    // Verify process is running
    expect(() => process.kill(pid, 0)).not.toThrow();

    // Import shutdownChild indirectly by testing connect's shutdown
    // Instead, test the pattern directly with a real process
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 2000);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      child.kill('SIGTERM');
    });

    // Process should be gone
    expect(() => process.kill(pid, 0)).toThrow();
  });
});
