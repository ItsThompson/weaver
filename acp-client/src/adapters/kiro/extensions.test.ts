import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WeaverDb } from '@weaver/shared/db';
import { createExtensionHandler, type ExtensionHandlerDeps } from './extensions/index.js';

describe('createExtensionHandler', () => {
  let db: WeaverDb;
  const sessionMap = new Map<string, string>();

  beforeEach(() => {
    db = new WeaverDb({ dbPath: ':memory:' });
    sessionMap.clear();

    // Create a test session
    db.createSession({
      id: 'internal-1',
      agent_session_id: 'acp-1',
      pid: null,
      cwd: '/tmp',
      agent_name: 'kiro',
      custom_name: null,
      model: null,
      status: 'open',
      context_usage_percent: null,
      created_at: new Date().toISOString(),
    });
    sessionMap.set('acp-1', 'internal-1');
  });

  afterEach(() => {
    db.close();
  });

  function makeDeps(overrides?: Partial<ExtensionHandlerDeps>): ExtensionHandlerDeps {
    return {
      db,
      getInternalSessionId: (acpId) => sessionMap.get(acpId),
      ...overrides,
    };
  }

  it('updates context_usage_percent on _kiro.dev/metadata', async () => {
    const handler = createExtensionHandler(makeDeps());
    await handler('_kiro.dev/metadata', { sessionId: 'acp-1', contextUsagePercentage: 0.75 });

    const session = db.getSession('internal-1');
    expect(session!.context_usage_percent).toBe(0.75);
  });

  it('ignores metadata for unknown session', async () => {
    const handler = createExtensionHandler(makeDeps());
    // Should not throw
    await handler('_kiro.dev/metadata', { sessionId: 'unknown', contextUsagePercentage: 0.5 });
  });

  it('calls onCompactionStatus callback', async () => {
    const statuses: string[] = [];
    const handler = createExtensionHandler(makeDeps({
      onCompactionStatus: (_sid, status) => { statuses.push(status); },
    }));

    await handler('_kiro.dev/compaction/status', { sessionId: 'acp-1', status: 'in_progress' });
    expect(statuses).toEqual(['in_progress']);
  });

  it('calls onClearStatus callback', async () => {
    const statuses: string[] = [];
    const handler = createExtensionHandler(makeDeps({
      onClearStatus: (_sid, status) => { statuses.push(status); },
    }));

    await handler('_kiro.dev/clear/status', { sessionId: 'acp-1', status: 'done' });
    expect(statuses).toEqual(['done']);
  });

  it('calls onMcpServerInitialized callback', async () => {
    const servers: string[] = [];
    const handler = createExtensionHandler(makeDeps({
      onMcpServerInitialized: (_sid, name) => { servers.push(name); },
    }));

    await handler('_kiro.dev/mcp/server_initialized', { sessionId: 'acp-1', serverName: 'my-mcp' });
    expect(servers).toEqual(['my-mcp']);
  });

  it('calls onOAuthRequest callback', async () => {
    const urls: string[] = [];
    const handler = createExtensionHandler(makeDeps({
      onOAuthRequest: (_sid, url) => { urls.push(url); },
    }));

    await handler('_kiro.dev/mcp/oauth_request', { sessionId: 'acp-1', url: 'https://auth.example.com' });
    expect(urls).toEqual(['https://auth.example.com']);
  });

  it('ignores unknown extension methods', async () => {
    const handler = createExtensionHandler(makeDeps());
    // Should not throw
    await handler('_kiro.dev/unknown_method', { sessionId: 'acp-1' });
  });
});
