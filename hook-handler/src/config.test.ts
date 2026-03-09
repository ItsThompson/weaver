import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
}));

const fs = await import('node:fs');
const { readProjectConfig } = await import('./config.js');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

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
    mockExistsSync.mockReturnValue(false);
    expect(readProjectConfig('/project')).toBeNull();
  });

  it('returns parsed config with all fields', () => {
    const config = {
      validation: {
        stop: [{ name: 'typecheck', command: 'npx tsc --noEmit', timeout_ms: 30000 }],
        postToolUse: [{ matcher: 'fs_write', name: 'format', command: 'npx prettier --write {{file}}' }],
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(config));
    expect(readProjectConfig('/project')).toEqual(config);
  });

  it('returns null and warns on invalid JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not json{');
    expect(readProjectConfig('/project')).toBeNull();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
  });

  it('returns config with empty validation object', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ validation: {} }));
    expect(readProjectConfig('/project')).toEqual({ validation: {} });
  });

  it('returns config without validation key', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({}));
    expect(readProjectConfig('/project')).toEqual({});
  });

  it('filters out stop hook missing name', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [{ command: 'echo hi' }, { name: 'ok', command: 'echo ok' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([{ name: 'ok', command: 'echo ok' }]);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('filters out stop hook missing command', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      validation: { stop: [{ name: 'bad' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop).toEqual([]);
  });

  it('filters out postToolUse hook missing matcher', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      validation: { postToolUse: [{ name: 'fmt', command: 'echo' }] },
    }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.postToolUse).toEqual([]);
  });

  it('preserves optional fields on valid hooks', () => {
    const hook = { name: 'test', command: 'jest', scope: 'parent', run_if_files_match: '**/*.ts', working_dir: 'src', timeout_ms: 5000 };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ validation: { stop: [hook] } }));
    const result = readProjectConfig('/project');
    expect(result!.validation!.stop![0]).toEqual(hook);
  });
});
