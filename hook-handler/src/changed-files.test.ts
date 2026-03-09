import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
}));

const fs = await import('node:fs');
const { extractChangedFiles } = await import('./changed-files.js');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

function makeEvent(hook_event_name: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', event: { hook_event_name, cwd: '/project', ...extra } });
}

beforeEach(() => { jest.clearAllMocks(); });

describe('extractChangedFiles', () => {
  it('extracts file paths from fs_write postToolUse events in current turn', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/src/a.ts' } }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/src/b.ts' } }),
    ].join('\n'));

    expect(extractChangedFiles('/log.jsonl')).toEqual(['/project/src/a.ts', '/project/src/b.ts']);
  });

  it('deduplicates repeated writes to the same file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/src/a.ts' } }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/src/a.ts' } }),
    ].join('\n'));

    expect(extractChangedFiles('/log.jsonl')).toEqual(['/project/src/a.ts']);
  });

  it('ignores events from previous turns', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'first' }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/old.ts' } }),
      makeEvent('stop'),
      makeEvent('userPromptSubmit', { prompt: 'second' }),
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/new.ts' } }),
    ].join('\n'));

    expect(extractChangedFiles('/log.jsonl')).toEqual(['/project/new.ts']);
  });

  it('returns [] for empty session log', () => {
    mockExistsSync.mockReturnValue(false);
    expect(extractChangedFiles('/missing.jsonl')).toEqual([]);
  });

  it('returns [] when no fs_write events in turn', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      makeEvent('postToolUse', { tool_name: 'fs_read', tool_input: { path: '/project/x.ts' } }),
    ].join('\n'));

    expect(extractChangedFiles('/log.jsonl')).toEqual([]);
  });

  it('handles malformed log lines gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue([
      makeEvent('userPromptSubmit', { prompt: 'go' }),
      'broken json line',
      makeEvent('postToolUse', { tool_name: 'fs_write', tool_input: { path: '/project/ok.ts' } }),
    ].join('\n'));

    expect(extractChangedFiles('/log.jsonl')).toEqual(['/project/ok.ts']);
  });
});
