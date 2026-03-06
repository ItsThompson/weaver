import { jest } from '@jest/globals';
import type { HookEvent, TurnGroup } from '@weaver/shared/types';
import type { MessageRow, ToolCallRow } from '@weaver/shared/db';

jest.unstable_mockModule('../storage/index', () => {
  const mockDb = {
    getEvents: jest.fn().mockReturnValue([]),
    getMessages: jest.fn().mockReturnValue([]),
    getToolCalls: jest.fn().mockReturnValue([]),
    getSession: jest.fn().mockReturnValue(null),
  };
  return {
    getDb: jest.fn().mockReturnValue(mockDb),
    __mockDb: mockDb,
  };
});

jest.unstable_mockModule('../../utils/logger', () => ({
  log: jest.fn(),
}));

const storageModule = await import('../storage/index') as any;
const { deriveActivity, getLastEvent, parseLogFile, groupEventsByTurn, buildTurnsFromSqlite } = await import('./log-parser');

const mockDb = storageModule.__mockDb;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deriveActivity', () => {
  it('returns starting for agentSpawn', () => {
    expect(deriveActivity('agentSpawn')).toBe('starting');
  });

  it('returns idle for stop', () => {
    expect(deriveActivity('stop')).toBe('idle');
  });

  it('returns running_tool for recent preToolUse', () => {
    expect(deriveActivity('preToolUse', new Date().toISOString())).toBe('running_tool');
  });

  it('returns pending_approval for old preToolUse', () => {
    const old = new Date(Date.now() - 20_000).toISOString();
    expect(deriveActivity('preToolUse', old)).toBe('pending_approval');
  });

  it('returns processing for other events', () => {
    expect(deriveActivity('userPromptSubmit')).toBe('processing');
  });
});

describe('getLastEvent', () => {
  it('returns null when no events exist', async () => {
    mockDb.getEvents.mockReturnValue([]);
    expect(await getLastEvent('test')).toBeNull();
  });

  it('returns mapped event name and timestamp', async () => {
    mockDb.getEvents.mockReturnValue([
      { id: 1, session_id: 'test', event_type: 'turn_end', data: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    const result = await getLastEvent('test');
    expect(result).toEqual({ name: 'stop', timestamp: '2026-01-01T00:00:00Z' });
  });

  it('maps session_start to agentSpawn', async () => {
    mockDb.getEvents.mockReturnValue([
      { id: 1, session_id: 'test', event_type: 'session_start', data: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    const result = await getLastEvent('test');
    expect(result!.name).toBe('agentSpawn');
  });
});

describe('parseLogFile', () => {
  it('returns empty array when no data exists', async () => {
    mockDb.getMessages.mockReturnValue([]);
    mockDb.getToolCalls.mockReturnValue([]);
    const result = await parseLogFile('test');
    expect(result).toEqual([]);
  });

  it('synthesizes HookEvents from messages and tool calls', async () => {
    mockDb.getSession.mockReturnValue({ cwd: '/tmp' });
    mockDb.getMessages.mockReturnValue([
      { id: 1, session_id: 'test', role: 'user', type: 'text', content: 'hello', metadata: null, created_at: '2026-01-01T00:00:01Z' },
    ]);
    mockDb.getToolCalls.mockReturnValue([
      { id: 'tc1', session_id: 'test', tool_name: 'fs_read', kind: 'read', status: 'completed', input: '{"path":"/a"}', output: '{"content":"data"}', started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:03Z' },
    ]);

    const result = await parseLogFile('test');
    expect(result).toHaveLength(3);
    expect(result[0].event.hook_event_name).toBe('userPromptSubmit');
    expect(result[0].event.prompt).toBe('hello');
    expect(result[1].event.hook_event_name).toBe('preToolUse');
    expect(result[1].event.tool_name).toBe('fs_read');
    expect(result[2].event.hook_event_name).toBe('postToolUse');
  });
});

describe('groupEventsByTurn', () => {
  function makeEvent(name: string, extra: Record<string, unknown> = {}): HookEvent {
    return { timestamp: new Date().toISOString(), event: { hook_event_name: name, cwd: '/tmp', ...extra } };
  }

  function makeTimedEvent(name: string, ms: number, extra: Record<string, unknown> = {}): HookEvent {
    return { timestamp: new Date(ms).toISOString(), event: { hook_event_name: name, cwd: '/tmp', ...extra } };
  }

  it('creates a standalone turn for agentSpawn', () => {
    const events = [makeEvent('agentSpawn')];
    const turns = groupEventsByTurn(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBeNull();
  });

  it('groups userPromptSubmit through stop as one turn', () => {
    const events = [
      makeEvent('agentSpawn'),
      makeEvent('userPromptSubmit', { prompt: 'hello' }),
      makeEvent('stop'),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns).toHaveLength(2);
    expect(turns[1].userPrompt).toBe('hello');
    expect(turns[1].events).toHaveLength(2);
  });

  it('matches preToolUse/postToolUse pairs', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'fs_read', tool_input: { path: '/a' } }),
      makeTimedEvent('postToolUse', 3000, { tool_name: 'fs_read', tool_input: { path: '/a' }, tool_response: { success: true, result: ['ok'] } }),
      makeTimedEvent('stop', 4000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].toolName).toBe('fs_read');
  });

  it('handles unmatched preToolUse', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'execute_bash', tool_input: { command: 'ls' } }),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].response).toBeUndefined();
  });
});

describe('buildTurnsFromSqlite', () => {
  function makeMsg(overrides: Partial<MessageRow> & { role: string; type: string; created_at: string }): MessageRow {
    return { id: 1, session_id: 'test', content: null, metadata: null, ...overrides } as MessageRow;
  }

  function makeTc(overrides: Partial<ToolCallRow> & { id: string; tool_name: string; started_at: string }): ToolCallRow {
    return { session_id: 'test', message_id: null, kind: null, status: 'completed', input: null, output: null, permission_response: null, completed_at: null, ...overrides } as ToolCallRow;
  }

  it('returns empty array for no data', () => {
    expect(buildTurnsFromSqlite([], [])).toEqual([]);
  });

  it('builds a turn from user message + assistant response', () => {
    const messages: MessageRow[] = [
      makeMsg({ id: 1, role: 'user', type: 'text', content: 'hello', created_at: '2026-01-01T00:00:01Z' }),
      makeMsg({ id: 2, role: 'assistant', type: 'text', content: 'hi there', created_at: '2026-01-01T00:00:02Z' }),
    ];
    const turns = buildTurnsFromSqlite(messages, []);
    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBe('hello');
    expect(turns[0].assistantContent).toBe('hi there');
  });

  it('includes tool call details in turns', () => {
    const messages: MessageRow[] = [
      makeMsg({ id: 1, role: 'user', type: 'text', content: 'read file', created_at: '2026-01-01T00:00:01Z' }),
    ];
    const toolCalls: ToolCallRow[] = [
      makeTc({ id: 'tc1', tool_name: 'fs_read', status: 'completed', input: '{"path":"/a"}', output: '"data"', started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:03Z' }),
    ];
    const turns = buildTurnsFromSqlite(messages, toolCalls);
    expect(turns).toHaveLength(1);
    expect(turns[0].toolCallDetails).toHaveLength(1);
    expect(turns[0].toolCallDetails![0].toolName).toBe('fs_read');
    expect(turns[0].toolCalls).toHaveLength(1);
  });

  it('handles multiple turns', () => {
    const messages: MessageRow[] = [
      makeMsg({ id: 1, role: 'user', type: 'text', content: 'first', created_at: '2026-01-01T00:00:01Z' }),
      makeMsg({ id: 2, role: 'assistant', type: 'text', content: 'response 1', created_at: '2026-01-01T00:00:02Z' }),
      makeMsg({ id: 3, role: 'user', type: 'text', content: 'second', created_at: '2026-01-01T00:00:03Z' }),
      makeMsg({ id: 4, role: 'assistant', type: 'text', content: 'response 2', created_at: '2026-01-01T00:00:04Z' }),
    ];
    const turns = buildTurnsFromSqlite(messages, []);
    expect(turns).toHaveLength(2);
    expect(turns[0].userPrompt).toBe('first');
    expect(turns[0].assistantContent).toBe('response 1');
    expect(turns[1].userPrompt).toBe('second');
    expect(turns[1].assistantContent).toBe('response 2');
  });

  it('associates tool calls with the correct turn by time', () => {
    const messages: MessageRow[] = [
      makeMsg({ id: 1, role: 'user', type: 'text', content: 'first', created_at: '2026-01-01T00:00:01Z' }),
      makeMsg({ id: 2, role: 'user', type: 'text', content: 'second', created_at: '2026-01-01T00:00:05Z' }),
    ];
    const toolCalls: ToolCallRow[] = [
      makeTc({ id: 'tc1', tool_name: 'fs_read', started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:03Z' }),
      makeTc({ id: 'tc2', tool_name: 'grep', started_at: '2026-01-01T00:00:06Z', completed_at: '2026-01-01T00:00:07Z' }),
    ];
    const turns = buildTurnsFromSqlite(messages, toolCalls);
    expect(turns).toHaveLength(2);
    expect(turns[0].toolCallDetails).toHaveLength(1);
    expect(turns[0].toolCallDetails![0].toolName).toBe('fs_read');
    expect(turns[1].toolCallDetails).toHaveLength(1);
    expect(turns[1].toolCallDetails![0].toolName).toBe('grep');
  });
});
