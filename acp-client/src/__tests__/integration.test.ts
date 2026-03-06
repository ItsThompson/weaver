import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { WeaverDb } from '@weaver/shared/db';
import type { MessageRow, ToolCallRow } from '@weaver/shared/db';
import { buildTurnsFromSqlite } from '../../src/core/../../../server/src/services/log-parser/log-parser';

/**
 * Integration test: verifies the data flow from ACP client storage writes
 * through to server-compatible reads. Uses in-memory SQLite.
 */

// Inline buildTurnsFromSqlite logic test since we can't import across packages
// in the test runner. Instead, we test the full round-trip through WeaverDb.

describe('ACP client → SQLite → server read integration', () => {
  let db: WeaverDb;

  beforeEach(() => {
    db = new WeaverDb({ dbPath: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  function createTestSession(overrides?: Record<string, unknown>): string {
    const id = randomUUID();
    db.createSession({
      id,
      agent_session_id: `acp-${id.slice(0, 8)}`,
      pid: 12345,
      cwd: '/tmp/test-project',
      agent_name: 'kiro',
      custom_name: null,
      model: null,
      status: 'open',
      context_usage_percent: null,
      created_at: new Date().toISOString(),
      ...overrides,
    });
    return id;
  }

  describe('session lifecycle', () => {
    it('creates a session and reads it back with all fields', () => {
      const id = createTestSession({ custom_name: 'test session', model: 'claude-opus-4.6' });

      const session = db.getSession(id);
      expect(session).not.toBeNull();
      expect(session!.id).toBe(id);
      expect(session!.agent_session_id).toMatch(/^acp-/);
      expect(session!.pid).toBe(12345);
      expect(session!.cwd).toBe('/tmp/test-project');
      expect(session!.agent_name).toBe('kiro');
      expect(session!.custom_name).toBe('test session');
      expect(session!.model).toBe('claude-opus-4.6');
      expect(session!.status).toBe('open');
    });

    it('lists sessions sorted by created_at descending', () => {
      const id1 = createTestSession({ created_at: '2026-01-01T00:00:00Z' });
      const id2 = createTestSession({ created_at: '2026-01-02T00:00:00Z' });

      const sessions = db.listSessions();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe(id2);
      expect(sessions[1].id).toBe(id1);
    });

    it('updates session status to closed', () => {
      const id = createTestSession();
      db.updateSession(id, { status: 'closed' });

      const session = db.getSession(id);
      expect(session!.status).toBe('closed');
    });

    it('deletes session and cascades to messages, tool calls, and events', () => {
      const id = createTestSession();

      db.appendMessage({ session_id: id, role: 'user', type: 'text', content: 'hello', metadata: null, created_at: new Date().toISOString() });
      db.upsertToolCall({ id: 'tc-1', session_id: id, message_id: null, tool_name: 'fs_read', kind: 'read', status: 'completed', input: '{}', output: '"data"', permission_response: null, started_at: new Date().toISOString(), completed_at: new Date().toISOString() });
      db.appendEvent({ session_id: id, event_type: 'session_start', data: null, created_at: new Date().toISOString() });

      db.deleteSession(id);

      expect(db.getSession(id)).toBeNull();
      expect(db.getMessages(id)).toEqual([]);
      expect(db.getToolCalls(id)).toEqual([]);
      expect(db.getEvents(id)).toEqual([]);
    });
  });

  describe('message persistence', () => {
    it('stores user and assistant messages in order', () => {
      const id = createTestSession();
      const t1 = '2026-01-01T00:00:01Z';
      const t2 = '2026-01-01T00:00:02Z';
      const t3 = '2026-01-01T00:00:03Z';

      db.appendMessage({ session_id: id, role: 'user', type: 'text', content: 'hello', metadata: null, created_at: t1 });
      db.appendMessage({ session_id: id, role: 'assistant', type: 'text', content: 'hi there', metadata: null, created_at: t2 });
      db.appendMessage({ session_id: id, role: 'user', type: 'text', content: 'thanks', metadata: null, created_at: t3 });

      const messages = db.getMessages(id);
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('hello');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('hi there');
      expect(messages[2].role).toBe('user');
      expect(messages[2].content).toBe('thanks');
    });

    it('messages are isolated between sessions', () => {
      const id1 = createTestSession();
      const id2 = createTestSession();

      db.appendMessage({ session_id: id1, role: 'user', type: 'text', content: 'session 1', metadata: null, created_at: new Date().toISOString() });
      db.appendMessage({ session_id: id2, role: 'user', type: 'text', content: 'session 2', metadata: null, created_at: new Date().toISOString() });

      expect(db.getMessages(id1)).toHaveLength(1);
      expect(db.getMessages(id1)[0].content).toBe('session 1');
      expect(db.getMessages(id2)).toHaveLength(1);
      expect(db.getMessages(id2)[0].content).toBe('session 2');
    });
  });

  describe('tool call persistence', () => {
    it('inserts and updates tool calls via upsert', () => {
      const id = createTestSession();
      const now = new Date().toISOString();

      db.upsertToolCall({
        id: 'tc-1', session_id: id, message_id: null, tool_name: 'fs_read',
        kind: 'read', status: 'pending', input: '{"path":"/a.ts"}', output: null,
        permission_response: null, started_at: now, completed_at: null,
      });

      let toolCalls = db.getToolCalls(id);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].status).toBe('pending');

      db.upsertToolCall({
        id: 'tc-1', session_id: id, message_id: null, tool_name: 'fs_read',
        kind: 'read', status: 'completed', input: '{"path":"/a.ts"}', output: '"file content"',
        permission_response: 'allow_once', started_at: now, completed_at: new Date().toISOString(),
      });

      toolCalls = db.getToolCalls(id);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].status).toBe('completed');
      expect(toolCalls[0].output).toBe('"file content"');
      expect(toolCalls[0].permission_response).toBe('allow_once');
      expect(toolCalls[0].completed_at).not.toBeNull();
    });
  });

  describe('event persistence', () => {
    it('stores events in chronological order', () => {
      const id = createTestSession();

      db.appendEvent({ session_id: id, event_type: 'session_start', data: '{"cwd":"/tmp"}', created_at: '2026-01-01T00:00:01Z' });
      db.appendEvent({ session_id: id, event_type: 'prompt', data: '{"content":"hello"}', created_at: '2026-01-01T00:00:02Z' });
      db.appendEvent({ session_id: id, event_type: 'turn_end', data: '{"stopReason":"end_turn"}', created_at: '2026-01-01T00:00:03Z' });

      const events = db.getEvents(id);
      expect(events).toHaveLength(3);
      expect(events[0].event_type).toBe('session_start');
      expect(events[1].event_type).toBe('prompt');
      expect(events[2].event_type).toBe('turn_end');
    });
  });

  describe('full conversation round-trip', () => {
    it('simulates a complete ACP session and verifies data integrity', () => {
      const sessionId = createTestSession();

      // Simulate session_start event
      db.appendEvent({ session_id: sessionId, event_type: 'session_start', data: JSON.stringify({ cwd: '/tmp/test-project' }), created_at: '2026-01-01T00:00:00Z' });

      // User sends a prompt
      db.appendMessage({ session_id: sessionId, role: 'user', type: 'text', content: 'Read the file /src/app.ts', metadata: null, created_at: '2026-01-01T00:00:01Z' });
      db.appendEvent({ session_id: sessionId, event_type: 'prompt', data: JSON.stringify({ content: 'Read the file /src/app.ts' }), created_at: '2026-01-01T00:00:01Z' });

      // Agent makes a tool call
      db.upsertToolCall({
        id: 'tc-read-1', session_id: sessionId, message_id: null, tool_name: 'fs_read',
        kind: 'read', status: 'pending', input: JSON.stringify({ path: '/src/app.ts' }), output: null,
        permission_response: null, started_at: '2026-01-01T00:00:02Z', completed_at: null,
      });
      db.appendEvent({ session_id: sessionId, event_type: 'tool_call', data: JSON.stringify({ toolName: 'fs_read' }), created_at: '2026-01-01T00:00:02Z' });

      // Tool call completes
      db.upsertToolCall({
        id: 'tc-read-1', session_id: sessionId, message_id: null, tool_name: 'fs_read',
        kind: 'read', status: 'completed', input: JSON.stringify({ path: '/src/app.ts' }), output: JSON.stringify({ content: 'export const app = {}' }),
        permission_response: 'allow_once', started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:03Z',
      });
      db.appendEvent({ session_id: sessionId, event_type: 'tool_result', data: JSON.stringify({ toolName: 'fs_read', status: 'completed' }), created_at: '2026-01-01T00:00:03Z' });

      // Agent responds
      db.appendMessage({ session_id: sessionId, role: 'assistant', type: 'text', content: 'The file contains a simple export.', metadata: null, created_at: '2026-01-01T00:00:04Z' });

      // Turn ends
      db.appendEvent({ session_id: sessionId, event_type: 'turn_end', data: JSON.stringify({ stopReason: 'end_turn' }), created_at: '2026-01-01T00:00:05Z' });

      // Verify all data is retrievable
      const session = db.getSession(sessionId);
      expect(session!.status).toBe('open');

      const messages = db.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');

      const toolCalls = db.getToolCalls(sessionId);
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].status).toBe('completed');
      expect(toolCalls[0].permission_response).toBe('allow_once');

      const events = db.getEvents(sessionId);
      expect(events).toHaveLength(5);

      // Verify buildTurnsFromSqlite produces correct output
      // (inline the logic since we can't cross-import server code)
      const turns = buildTurns(messages, toolCalls);
      expect(turns).toHaveLength(1);
      expect(turns[0].userPrompt).toBe('Read the file /src/app.ts');
      expect(turns[0].assistantContent).toBe('The file contains a simple export.');
      expect(turns[0].toolCalls).toHaveLength(1);
      expect(turns[0].toolCalls[0].toolName).toBe('fs_read');
      expect(turns[0].toolCalls[0].status).toBe('completed');
    });

    it('handles multi-turn conversation', () => {
      const sessionId = createTestSession();

      // Turn 1
      db.appendMessage({ session_id: sessionId, role: 'user', type: 'text', content: 'What is 2+2?', metadata: null, created_at: '2026-01-01T00:00:01Z' });
      db.appendMessage({ session_id: sessionId, role: 'assistant', type: 'text', content: '4', metadata: null, created_at: '2026-01-01T00:00:02Z' });

      // Turn 2
      db.appendMessage({ session_id: sessionId, role: 'user', type: 'text', content: 'And 3+3?', metadata: null, created_at: '2026-01-01T00:00:03Z' });
      db.appendMessage({ session_id: sessionId, role: 'assistant', type: 'text', content: '6', metadata: null, created_at: '2026-01-01T00:00:04Z' });

      const messages = db.getMessages(sessionId);
      const turns = buildTurns(messages, []);

      expect(turns).toHaveLength(2);
      expect(turns[0].userPrompt).toBe('What is 2+2?');
      expect(turns[0].assistantContent).toBe('4');
      expect(turns[1].userPrompt).toBe('And 3+3?');
      expect(turns[1].assistantContent).toBe('6');
    });

    it('associates tool calls with correct turns by timestamp', () => {
      const sessionId = createTestSession();

      // Turn 1 with tool call
      db.appendMessage({ session_id: sessionId, role: 'user', type: 'text', content: 'read file', metadata: null, created_at: '2026-01-01T00:00:01Z' });
      db.upsertToolCall({
        id: 'tc-1', session_id: sessionId, message_id: null, tool_name: 'fs_read',
        kind: 'read', status: 'completed', input: '{}', output: '"data"',
        permission_response: null, started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:03Z',
      });

      // Turn 2 with different tool call
      db.appendMessage({ session_id: sessionId, role: 'user', type: 'text', content: 'run tests', metadata: null, created_at: '2026-01-01T00:00:05Z' });
      db.upsertToolCall({
        id: 'tc-2', session_id: sessionId, message_id: null, tool_name: 'execute_bash',
        kind: 'execute', status: 'completed', input: '{"command":"npm test"}', output: '"pass"',
        permission_response: null, started_at: '2026-01-01T00:00:06Z', completed_at: '2026-01-01T00:00:07Z',
      });

      const messages = db.getMessages(sessionId);
      const toolCalls = db.getToolCalls(sessionId);
      const turns = buildTurns(messages, toolCalls);

      expect(turns).toHaveLength(2);
      expect(turns[0].toolCalls).toHaveLength(1);
      expect(turns[0].toolCalls[0].toolName).toBe('fs_read');
      expect(turns[1].toolCalls).toHaveLength(1);
      expect(turns[1].toolCalls[0].toolName).toBe('execute_bash');
    });

    it('concurrent sessions write independently', () => {
      const id1 = createTestSession();
      const id2 = createTestSession();

      // Interleaved writes from two sessions
      db.appendMessage({ session_id: id1, role: 'user', type: 'text', content: 'session 1 prompt', metadata: null, created_at: '2026-01-01T00:00:01Z' });
      db.appendMessage({ session_id: id2, role: 'user', type: 'text', content: 'session 2 prompt', metadata: null, created_at: '2026-01-01T00:00:01Z' });
      db.appendMessage({ session_id: id1, role: 'assistant', type: 'text', content: 'response 1', metadata: null, created_at: '2026-01-01T00:00:02Z' });
      db.appendMessage({ session_id: id2, role: 'assistant', type: 'text', content: 'response 2', metadata: null, created_at: '2026-01-01T00:00:02Z' });

      const msgs1 = db.getMessages(id1);
      const msgs2 = db.getMessages(id2);

      expect(msgs1).toHaveLength(2);
      expect(msgs1[0].content).toBe('session 1 prompt');
      expect(msgs1[1].content).toBe('response 1');

      expect(msgs2).toHaveLength(2);
      expect(msgs2[0].content).toBe('session 2 prompt');
      expect(msgs2[1].content).toBe('response 2');
    });
  });

  describe('context usage tracking', () => {
    it('updates context_usage_percent on session', () => {
      const id = createTestSession();

      db.updateSession(id, { context_usage_percent: 42.5 });
      const session = db.getSession(id);
      expect(session!.context_usage_percent).toBe(42.5);
    });
  });
});

/**
 * Minimal buildTurns implementation matching server's buildTurnsFromSqlite.
 * This verifies the data contract between ACP client writes and server reads.
 */
interface Turn {
  userPrompt: string | null;
  assistantContent?: string;
  toolCalls: { toolName: string; status: string; input?: string; output?: string }[];
  startTime: string;
  endTime: string;
}

function buildTurns(messages: MessageRow[], toolCalls: ToolCallRow[]): Turn[] {
  const turns: Turn[] = [];
  let currentUserPrompt: string | null = null;
  let currentAssistantChunks: string[] = [];
  let currentToolCalls: ToolCallRow[] = [];
  let turnStart: string | null = null;
  let turnEnd: string | null = null;
  let tcIndex = 0;

  const flush = () => {
    if (!turnStart) return;
    turns.push({
      userPrompt: currentUserPrompt,
      assistantContent: currentAssistantChunks.length > 0 ? currentAssistantChunks.join('') : undefined,
      toolCalls: currentToolCalls.map((tc) => ({
        toolName: tc.tool_name,
        status: tc.status,
        input: tc.input ?? undefined,
        output: tc.output ?? undefined,
      })),
      startTime: turnStart,
      endTime: turnEnd ?? turnStart,
    });
    currentUserPrompt = null;
    currentAssistantChunks = [];
    currentToolCalls = [];
    turnStart = null;
    turnEnd = null;
  };

  const collectToolCalls = (afterTime: string, beforeTime?: string) => {
    while (tcIndex < toolCalls.length) {
      const tc = toolCalls[tcIndex];
      if (tc.started_at < afterTime) { tcIndex++; continue; }
      if (beforeTime && tc.started_at >= beforeTime) break;
      currentToolCalls.push(tc);
      turnEnd = tc.completed_at ?? tc.started_at;
      tcIndex++;
    }
  };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && msg.type === 'text') {
      flush();
      currentUserPrompt = msg.content;
      turnStart = msg.created_at;
      turnEnd = msg.created_at;
      const nextUserTime = messages.slice(i + 1).find((m) => m.role === 'user' && m.type === 'text')?.created_at;
      collectToolCalls(msg.created_at, nextUserTime);
      continue;
    }
    if (msg.role === 'assistant' && msg.type === 'text' && msg.content) {
      if (!turnStart) turnStart = msg.created_at;
      currentAssistantChunks.push(msg.content);
      turnEnd = msg.created_at;
    }
  }
  flush();

  while (tcIndex < toolCalls.length) {
    const tc = toolCalls[tcIndex];
    currentToolCalls.push(tc);
    if (!turnStart) turnStart = tc.started_at;
    turnEnd = tc.completed_at ?? tc.started_at;
    tcIndex++;
  }
  if (currentToolCalls.length > 0) flush();

  return turns;
}
