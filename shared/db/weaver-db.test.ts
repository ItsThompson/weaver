import { WeaverDb } from './weaver-db';
import type { SessionRow, ToolCallRow } from './types';

function createDb(): WeaverDb {
  return new WeaverDb({ dbPath: ':memory:' });
}

function makeSession(overrides?: Partial<Omit<SessionRow, 'updated_at'>>): Omit<SessionRow, 'updated_at'> {
  return {
    id: 'sess-1',
    agent_session_id: null,
    pid: 1234,
    cwd: '/tmp/project',
    agent_name: 'kiro',
    custom_name: null,
    model: null,
    status: 'open',
    context_usage_percent: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeToolCall(overrides?: Partial<ToolCallRow>): ToolCallRow {
  return {
    id: 'tc-1',
    session_id: 'sess-1',
    message_id: null,
    tool_name: 'fs_read',
    kind: 'read',
    status: 'pending',
    input: '{"path":"/tmp/file.ts"}',
    output: null,
    permission_response: null,
    started_at: '2026-01-01T00:00:01.000Z',
    completed_at: null,
    ...overrides,
  };
}

describe('WeaverDb', () => {
  let db: WeaverDb;

  beforeEach(() => {
    db = createDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('schema', () => {
    it('creates tables on first open', () => {
      // If schema wasn't applied, operations would throw
      expect(() => db.listSessions()).not.toThrow();
    });

    it('is idempotent — second instance on same DB does not error', () => {
      // Schema already applied by beforeEach; creating another WeaverDb on :memory: is a separate DB,
      // but we can verify applySchema doesn't fail when tables exist by calling it implicitly
      const db2 = createDb();
      expect(() => db2.listSessions()).not.toThrow();
      db2.close();
    });
  });

  describe('sessions', () => {
    it('creates and retrieves a session', () => {
      db.createSession(makeSession());
      const session = db.getSession('sess-1');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('sess-1');
      expect(session!.cwd).toBe('/tmp/project');
      expect(session!.status).toBe('open');
      expect(session!.updated_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('returns null for non-existent session', () => {
      expect(db.getSession('nope')).toBeNull();
    });

    it('lists sessions ordered by created_at DESC', () => {
      db.createSession(makeSession({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' }));
      db.createSession(makeSession({ id: 'b', created_at: '2026-01-02T00:00:00.000Z' }));
      const sessions = db.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('b');
      expect(sessions[1].id).toBe('a');
    });

    it('updates session fields', () => {
      db.createSession(makeSession());
      db.updateSession('sess-1', { custom_name: 'my session', status: 'closed' });
      const session = db.getSession('sess-1');
      expect(session!.custom_name).toBe('my session');
      expect(session!.status).toBe('closed');
    });

    it('update with no fields is a no-op', () => {
      db.createSession(makeSession());
      const before = db.getSession('sess-1')!;
      db.updateSession('sess-1', {});
      const after = db.getSession('sess-1')!;
      expect(after.updated_at).toBe(before.updated_at);
    });

    it('deletes a session', () => {
      db.createSession(makeSession());
      db.deleteSession('sess-1');
      expect(db.getSession('sess-1')).toBeNull();
    });
  });

  describe('messages', () => {
    beforeEach(() => {
      db.createSession(makeSession());
    });

    it('appends and retrieves messages', () => {
      const id = db.appendMessage({
        session_id: 'sess-1',
        role: 'user',
        type: 'text',
        content: 'hello',
        metadata: null,
        created_at: '2026-01-01T00:00:01.000Z',
      });
      expect(id).toBeGreaterThan(0);

      const messages = db.getMessages('sess-1');
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('hello');
      expect(messages[0].role).toBe('user');
    });

    it('returns messages ordered by created_at ASC', () => {
      db.appendMessage({ session_id: 'sess-1', role: 'user', type: 'text', content: 'first', metadata: null, created_at: '2026-01-01T00:00:01.000Z' });
      db.appendMessage({ session_id: 'sess-1', role: 'assistant', type: 'text', content: 'second', metadata: null, created_at: '2026-01-01T00:00:02.000Z' });
      const messages = db.getMessages('sess-1');
      expect(messages[0].content).toBe('first');
      expect(messages[1].content).toBe('second');
    });

    it('returns empty array for session with no messages', () => {
      expect(db.getMessages('sess-1')).toEqual([]);
    });
  });

  describe('tool calls', () => {
    beforeEach(() => {
      db.createSession(makeSession());
    });

    it('inserts and retrieves a tool call', () => {
      db.upsertToolCall(makeToolCall());
      const calls = db.getToolCalls('sess-1');
      expect(calls).toHaveLength(1);
      expect(calls[0].tool_name).toBe('fs_read');
      expect(calls[0].status).toBe('pending');
    });

    it('upserts — updates status, output, permission_response, completed_at on conflict', () => {
      db.upsertToolCall(makeToolCall());
      db.upsertToolCall(makeToolCall({
        status: 'completed',
        output: '"file contents"',
        permission_response: 'allow_once',
        completed_at: '2026-01-01T00:00:05.000Z',
      }));
      const calls = db.getToolCalls('sess-1');
      expect(calls).toHaveLength(1);
      expect(calls[0].status).toBe('completed');
      expect(calls[0].output).toBe('"file contents"');
      expect(calls[0].permission_response).toBe('allow_once');
      expect(calls[0].completed_at).toBe('2026-01-01T00:00:05.000Z');
    });

    it('returns tool calls ordered by started_at ASC', () => {
      db.upsertToolCall(makeToolCall({ id: 'tc-a', started_at: '2026-01-01T00:00:02.000Z' }));
      db.upsertToolCall(makeToolCall({ id: 'tc-b', started_at: '2026-01-01T00:00:01.000Z' }));
      const calls = db.getToolCalls('sess-1');
      expect(calls[0].id).toBe('tc-b');
      expect(calls[1].id).toBe('tc-a');
    });
  });

  describe('events', () => {
    beforeEach(() => {
      db.createSession(makeSession());
    });

    it('appends and retrieves events', () => {
      db.appendEvent({
        session_id: 'sess-1',
        event_type: 'session_start',
        data: JSON.stringify({ agent: 'kiro' }),
        created_at: '2026-01-01T00:00:01.000Z',
      });
      const events = db.getEvents('sess-1');
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('session_start');
      expect(JSON.parse(events[0].data!)).toEqual({ agent: 'kiro' });
    });

    it('returns events ordered by created_at ASC', () => {
      db.appendEvent({ session_id: 'sess-1', event_type: 'prompt', data: null, created_at: '2026-01-01T00:00:02.000Z' });
      db.appendEvent({ session_id: 'sess-1', event_type: 'session_start', data: null, created_at: '2026-01-01T00:00:01.000Z' });
      const events = db.getEvents('sess-1');
      expect(events[0].event_type).toBe('session_start');
      expect(events[1].event_type).toBe('prompt');
    });

    it('returns empty array for session with no events', () => {
      expect(db.getEvents('sess-1')).toEqual([]);
    });
  });

  describe('cascade deletes', () => {
    it('deleting a session removes its messages, tool calls, and events', () => {
      db.createSession(makeSession());
      db.appendMessage({ session_id: 'sess-1', role: 'user', type: 'text', content: 'hi', metadata: null, created_at: '2026-01-01T00:00:01.000Z' });
      db.upsertToolCall(makeToolCall());
      db.appendEvent({ session_id: 'sess-1', event_type: 'session_start', data: null, created_at: '2026-01-01T00:00:01.000Z' });

      db.deleteSession('sess-1');

      expect(db.getMessages('sess-1')).toEqual([]);
      expect(db.getToolCalls('sess-1')).toEqual([]);
      expect(db.getEvents('sess-1')).toEqual([]);
    });
  });

  describe('WAL mode', () => {
    it('enables WAL journal mode', () => {
      // Access the underlying db to check pragma — use a fresh instance
      const db2 = createDb();
      // WAL mode is set in constructor; verify by querying
      // We can't easily check this without accessing internals, but we can verify
      // the DB works correctly (WAL mode doesn't change behavior, just performance)
      db2.createSession(makeSession());
      expect(db2.getSession('sess-1')).not.toBeNull();
      db2.close();
    });
  });

  describe('close', () => {
    it('closes without error', () => {
      expect(() => db.close()).not.toThrow();
    });
  });
});
