import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
}));

const fs = await import('node:fs');
const { getCurrentTurnEvents } = await import('./turn-boundary.js');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

function makeEvent(hook_event_name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', event: { hook_event_name, cwd: '/project', ...extra } });
}

beforeEach(() => { jest.clearAllMocks(); });

describe('getCurrentTurnEvents', () => {
  it('returns events after last userPromptSubmit', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('agentSpawn'),
      makeEvent('userPromptSubmit', { prompt: 'first' }),
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
      makeEvent('stop'),
      makeEvent('userPromptSubmit', { prompt: 'second' }),
      makeEvent('postToolUse', { tool_name: 'fs_read' }),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
    expect(result[0].event.hook_event_name).toBe('userPromptSubmit');
    expect(result[0].event.prompt).toBe('second');
  });

  it('returns events after last agentSpawn when no userPromptSubmit follows', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('agentSpawn'),
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
    expect(result[0].event.hook_event_name).toBe('agentSpawn');
  });

  it('returns all events when no boundary event exists', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
      makeEvent('stop'),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
  });

  it('returns [] for missing log file', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getCurrentTurnEvents('/missing.jsonl')).toEqual([]);
  });

  it('returns [] for empty log file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('');
    expect(getCurrentTurnEvents('/empty.jsonl')).toEqual([]);
  });

  it('skips malformed lines gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'hi' }),
      'not valid json',
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
    expect(result[1].event.tool_name).toBe('fs_write');
  });
});
