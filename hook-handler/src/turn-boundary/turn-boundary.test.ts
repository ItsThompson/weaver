import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockFs, makeEvent } from '../__test-helpers__/index';

const { existsSync, readFileSync } = await mockFs();
const { getCurrentTurnEvents } = await import('./turn-boundary');

beforeEach(() => { jest.clearAllMocks(); });

describe('getCurrentTurnEvents', () => {
  it('returns events after last userPromptSubmit', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue([
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
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue([
      makeEvent('agentSpawn'),
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
    expect(result[0].event.hook_event_name).toBe('agentSpawn');
  });

  it('returns all events when no boundary event exists', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue([
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
      makeEvent('stop'),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
  });

  it('returns [] for missing log file', () => {
    existsSync.mockReturnValue(false);
    expect(getCurrentTurnEvents('/missing.jsonl')).toEqual([]);
  });

  it('returns [] for empty log file', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('');
    expect(getCurrentTurnEvents('/empty.jsonl')).toEqual([]);
  });

  it('skips malformed lines gracefully', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'hi' }),
      'not valid json',
      makeEvent('postToolUse', { tool_name: 'fs_write' }),
    ].join('\n'));

    const result = getCurrentTurnEvents('/log.jsonl');
    expect(result).toHaveLength(2);
    expect(result[1].event.tool_name).toBe('fs_write');
  });
});
