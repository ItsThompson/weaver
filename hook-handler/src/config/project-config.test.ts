import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockFs } from '../__test-helpers__/index';

const { existsSync, readFileSync } = await mockFs();
const { readProjectConfig } = await import('./project-config');

let stderrSpy: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  jest.clearAllMocks();
  stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stderrSpy.mockRestore();
});

describe('readProjectConfig', () => {
  it('returns null when .weaver file does not exist', () => {
    existsSync.mockReturnValue(false);
    expect(readProjectConfig('/project')).toBeNull();
  });

  it('returns parsed config with all fields', () => {
    const config = {
      validation: {
        stop: [{ name: 'typecheck', command: 'npx tsc --noEmit', timeout_ms: 30000 }],
        postToolUse: [{ matcher: 'fs_write', name: 'format', command: 'npx prettier --write {{file}}' }],
      },
    };
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify(config));
    expect(readProjectConfig('/project')).toEqual(config);
  });

  it('returns null and warns on invalid JSON', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('not json{');
    expect(readProjectConfig('/project')).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
  });

  it('returns config with empty validation object', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: {} }));
    expect(readProjectConfig('/project')).toEqual({ validation: {} });
  });

  it('returns config without validation key', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({}));
    expect(readProjectConfig('/project')).toEqual({});
  });

  it('filters out stop hook missing name', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [{ command: 'echo hi' }, { name: 'ok', command: 'echo ok' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([{ name: 'ok', command: 'echo ok' }]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid stop hook'));
  });

  it('filters out stop hook missing command', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [{ name: 'bad' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([]);
  });

  it('filters out postToolUse hook missing matcher', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({
      validation: { postToolUse: [{ name: 'fmt', command: 'echo' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.postToolUse).toEqual([]);
  });

  it('preserves optional fields on valid hooks', () => {
    const hook = { name: 'test', command: 'jest', scope: 'parent', run_if_files_match: '**/*.ts', working_dir: 'src', timeout_ms: 5000 };
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: { stop: [hook] } }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop![0]).toEqual(hook);
  });

  it('parses test_runners from project config', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: { test_runners: ['rspec', 'mix test'] } }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.test_runners).toEqual(['rspec', 'mix test']);
  });

  it('filters non-string test_runners entries', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: { test_runners: ['jest', 42, null] } }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.test_runners).toEqual(['jest']);
  });

  it('returns null and warns when top-level value is not an object', () => {
    existsSync.mockReturnValue(true);
    for (const value of ['"hello"', '42', 'null', '[1,2]']) {
      jest.clearAllMocks();
      stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      existsSync.mockReturnValue(true);
      readFileSync.mockReturnValue(value);
      expect(readProjectConfig('/project')).toBeNull();
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('must be a JSON object'));
    }
  });

  it('returns {} and warns when validation is not an object', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: 'bad' }));
    expect(readProjectConfig('/project')).toEqual({});
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('validation must be an object'));
  });

  it('warns and skips when validation.stop is not an array', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: { stop: 'bad' } }));
    const result = readProjectConfig('/project');
    expect(result).toEqual({ validation: {} });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('stop must be an array'));
  });

  it('warns and skips when validation.postToolUse is not an array', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({ validation: { postToolUse: 42 } }));
    const result = readProjectConfig('/project');
    expect(result).toEqual({ validation: {} });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('postToolUse must be an array'));
  });

  it('filters out stop hook with invalid scope type', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [
        { name: 'bad-scope', command: 'echo', scope: true },
        { name: 'ok', command: 'echo ok' },
      ] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([{ name: 'ok', command: 'echo ok' }]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid stop hook'));
  });

  it('filters out stop hook with invalid timeout_ms type', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [{ name: 'bad-timeout', command: 'echo', timeout_ms: '30000' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid stop hook'));
  });
});
