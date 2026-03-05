import { jest } from '@jest/globals';
import type { HookEvent } from '@weaver/shared/types';

// Mock fs modules before importing
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn<() => Promise<string>>(),
  mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readdir: jest.fn<() => Promise<string[]>>(),
  unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  stat: jest.fn<() => Promise<{ mtimeMs: number }>>().mockRejectedValue(new Error('no stat mock')),
}));

jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn<() => boolean>(),
}));

jest.unstable_mockModule('../../utils/logger', () => ({
  log: jest.fn(),
}));

const fs = await import('node:fs');
const fsp = await import('node:fs/promises');
const { parseLogFile, groupEventsByTurn, _logCache } = await import('./log-parser');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFile = fsp.readFile as jest.MockedFunction<typeof fsp.readFile>;

beforeEach(() => {
  jest.clearAllMocks();
  _logCache.clear();
});

function makeEvent(name: string, extra: Record<string, unknown> = {}): HookEvent {
  return {
    timestamp: new Date().toISOString(),
    event: { hook_event_name: name, cwd: '/tmp', ...extra },
  };
}

function makeTimedEvent(name: string, ms: number, extra: Record<string, unknown> = {}): HookEvent {
  return {
    timestamp: new Date(ms).toISOString(),
    event: { hook_event_name: name, cwd: '/tmp', ...extra },
  };
}

describe('parseLogFile', () => {
  it('returns empty array when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    expect(await parseLogFile('missing')).toEqual([]);
  });

  it('parses valid JSONL into HookEvent array', async () => {
    mockExistsSync.mockReturnValue(true);
    const event = makeEvent('agentSpawn');
    mockReadFile.mockResolvedValue(JSON.stringify(event) + '\n');
    const result = await parseLogFile('test-id');
    expect(result).toHaveLength(1);
    expect(result[0].event.hook_event_name).toBe('agentSpawn');
  });

  it('skips malformed lines without crashing', async () => {
    mockExistsSync.mockReturnValue(true);
    const valid = JSON.stringify(makeEvent('agentSpawn'));
    mockReadFile.mockResolvedValue(`${valid}\n{bad json\n`);
    const result = await parseLogFile('test-id');
    expect(result).toHaveLength(1);
  });
});

describe('groupEventsByTurn', () => {
  it('creates a standalone turn for agentSpawn', () => {
    const events = [makeEvent('agentSpawn')];
    const turns = groupEventsByTurn(events);
    expect(turns).toHaveLength(1);
    expect(turns[0].userPrompt).toBeNull();
    expect(turns[0].events[0].event.hook_event_name).toBe('agentSpawn');
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

  it('matches preToolUse/postToolUse pairs by tool name sequentially', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'fs_read', tool_input: { path: '/a' } }),
      makeTimedEvent('postToolUse', 3000, { tool_name: 'fs_read', tool_input: { path: '/a' }, tool_response: { success: true, result: ['ok'] } }),
      makeTimedEvent('stop', 4000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].toolName).toBe('fs_read');
    expect(turns[0].toolCalls[0].input).toEqual({ path: '/a' });
    expect(turns[0].toolCalls[0].response).toBeDefined();
  });

  it('handles parallel calls to different tools', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'fs_read', tool_input: { path: '/a' } }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'grep', tool_input: { pattern: 'x' } }),
      makeTimedEvent('postToolUse', 3000, { tool_name: 'grep', tool_input: { pattern: 'x' }, tool_response: { success: true, result: [] } }),
      makeTimedEvent('postToolUse', 3500, { tool_name: 'fs_read', tool_input: { path: '/a' }, tool_response: { success: true, result: ['data'] } }),
      makeTimedEvent('stop', 4000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(2);
    const toolNames = turns[0].toolCalls.map((tc: { toolName: string }) => tc.toolName);
    expect(toolNames).toContain('fs_read');
    expect(toolNames).toContain('grep');
  });

  it('handles multiple calls to the same tool sequentially', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'fs_read', tool_input: { path: '/a' } }),
      makeTimedEvent('postToolUse', 3000, { tool_name: 'fs_read', tool_input: { path: '/a' }, tool_response: { success: true, result: ['a'] } }),
      makeTimedEvent('preToolUse', 4000, { tool_name: 'fs_read', tool_input: { path: '/b' } }),
      makeTimedEvent('postToolUse', 5000, { tool_name: 'fs_read', tool_input: { path: '/b' }, tool_response: { success: true, result: ['b'] } }),
      makeTimedEvent('stop', 6000),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(2);
    expect(turns[0].toolCalls[0].input).toEqual({ path: '/a' });
    expect(turns[0].toolCalls[1].input).toEqual({ path: '/b' });
  });

  it('handles unmatched preToolUse (no response yet)', () => {
    const events = [
      makeTimedEvent('userPromptSubmit', 1000, { prompt: 'test' }),
      makeTimedEvent('preToolUse', 2000, { tool_name: 'execute_bash', tool_input: { command: 'ls' } }),
    ];
    const turns = groupEventsByTurn(events);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0].toolName).toBe('execute_bash');
    expect(turns[0].toolCalls[0].response).toBeUndefined();
  });
});
