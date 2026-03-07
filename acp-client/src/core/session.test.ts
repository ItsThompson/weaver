import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import { WeaverDb } from '@weaver/shared/db';
import { createSessionManager } from './session.js';
import type { SessionManager } from './types.js';
import { setupInProcessConnection } from '../__tests__/setup.js';

describe('SessionManager', () => {
  let db: WeaverDb;

  beforeEach(() => { db = new WeaverDb({ dbPath: ':memory:' }); });
  afterEach(() => { db.close(); });

  it('createSession returns session ID and stores in SQLite', async () => {
    const { client } = setupInProcessConnection({ sessionId: 'acp-sess-42' });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db, agentName: 'kiro', pid: 1234 });
    const result = await sm.createSession('/tmp/project', []);

    expect(result.sessionId).toBe('acp-sess-42');
    expect(result.internalId).toBeTruthy();

    const row = db.getSession(result.internalId);
    expect(row).not.toBeNull();
    expect(row!.agent_session_id).toBe('acp-sess-42');
    expect(row!.cwd).toBe('/tmp/project');
    expect(row!.agent_name).toBe('kiro');
    expect(row!.pid).toBe(1234);
    expect(row!.status).toBe('open');

    const events = db.getEvents(result.internalId);
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('session_start');
  });

  it('createSession returns modes when agent provides them', async () => {
    const modes = {
      availableModes: [{ id: 'code', name: 'Code' }, { id: 'ask', name: 'Ask' }],
      currentModeId: 'code',
    };
    const { client } = setupInProcessConnection({ modes });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db });
    const result = await sm.createSession('/tmp', []);
    expect(result.modes).toEqual(modes);
  });

  it('loadSession calls agent.loadSession', async () => {
    let loadCalled = false;
    const { client } = setupInProcessConnection({ onLoadSession: () => { loadCalled = true; } });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db });
    await sm.loadSession('existing-session', '/tmp', []);
    expect(loadCalled).toBe(true);
  });

  it('sendPrompt sends content and returns stop reason', async () => {
    let receivedPrompt: ContentBlock[] | null = null;
    const { client } = setupInProcessConnection({
      sessionId: 'sess-1',
      onPrompt: (params) => { receivedPrompt = params.prompt; },
    });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db });
    const response = await sm.sendPrompt('sess-1', [{ type: 'text', text: 'hello' }]);
    expect(response.stopReason).toBe('end_turn');
    expect(receivedPrompt).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('cancel sends cancel notification', async () => {
    let cancelCalled = false;
    const { client } = setupInProcessConnection({ onCancel: () => { cancelCalled = true; } });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db });
    await sm.cancel('sess-1');
    expect(cancelCalled).toBe(true);
  });

  it('setMode calls agent.setSessionMode', async () => {
    let receivedModeId: string | null = null;
    const { client } = setupInProcessConnection({ onSetMode: (modeId) => { receivedModeId = modeId; } });
    await client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: 'weaver', version: '1.0.0' },
      clientCapabilities: {},
    });

    const sm = createSessionManager({ agent: client, db });
    await sm.setMode('sess-1', 'ask');
    expect(receivedModeId).toBe('ask');
  });
});
