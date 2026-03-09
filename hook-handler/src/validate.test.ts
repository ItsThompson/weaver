import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { SpawnSyncReturns } from 'node:child_process';
import type { WeaverProjectConfig } from '@weaver/shared/types';
import type { ValidateArgs } from './validate.js';

jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: jest.fn<() => Partial<SpawnSyncReturns<string>>>(),
}));

jest.unstable_mockModule('node:fs', () => ({
  appendFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
  realpathSync: jest.fn<(p: string) => string>(),
}));

jest.unstable_mockModule('./config.js', () => ({
  readProjectConfig: jest.fn<() => WeaverProjectConfig | null>(),
  resolveTestRunners: jest.fn<() => string[]>(),
}));

jest.unstable_mockModule('./changed-files.js', () => ({
  extractChangedFiles: jest.fn<() => string[]>(),
}));

jest.unstable_mockModule('./agent-tests.js', () => ({
  extractAgentTestedDirs: jest.fn<() => string[]>(),
}));

jest.unstable_mockModule('./scope.js', () => ({
  resolveTestDirs: jest.fn<() => string[]>(),
}));

const cp = await import('node:child_process');
const fs = await import('node:fs');
const { readProjectConfig, resolveTestRunners } = await import('./config.js');
const { extractChangedFiles } = await import('./changed-files.js');
const { extractAgentTestedDirs } = await import('./agent-tests.js');
const { resolveTestDirs } = await import('./scope.js');

const mockSpawnSync = cp.spawnSync as jest.MockedFunction<typeof cp.spawnSync>;
const mockAppendFileSync = fs.appendFileSync as jest.MockedFunction<typeof fs.appendFileSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;
const mockReadProjectConfig = readProjectConfig as jest.MockedFunction<typeof readProjectConfig>;
const mockResolveTestRunners = resolveTestRunners as jest.MockedFunction<typeof resolveTestRunners>;
const mockExtractChangedFiles = extractChangedFiles as jest.MockedFunction<typeof extractChangedFiles>;
const mockExtractAgentTestedDirs = extractAgentTestedDirs as jest.MockedFunction<typeof extractAgentTestedDirs>;
const mockResolveTestDirs = resolveTestDirs as jest.MockedFunction<typeof resolveTestDirs>;

// We can't import runValidation directly because the module has top-level side effects
// (it calls process.exit at the bottom). We need to mock process.exit before importing.
let mockExit: jest.SpiedFunction<typeof process.exit>;
let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

// Import with process.exit mocked to prevent the module from actually exiting
mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const { runValidation, matchesExtensionGlob, runStopHook } = await import('./validate.js');
mockExit.mockRestore();

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest.fn<typeof globalThis.fetch>().mockResolvedValue(new Response());
  globalThis.fetch = mockFetch;
  mockResolveTestRunners.mockReturnValue(['jest', 'vitest', 'npm test']);
});

function spawnResult(overrides: Partial<SpawnSyncReturns<string>> = {}): SpawnSyncReturns<string> {
  return { pid: 1, output: [], stdout: '', stderr: '', status: 0, signal: null, error: undefined as unknown as Error, ...overrides } as SpawnSyncReturns<string>;
}

const stopArgs: ValidateArgs = { sessionId: 'sess-1', cwd: '/project', trigger: 'stop' };
const postToolArgs: ValidateArgs = { sessionId: 'sess-1', cwd: '/project', trigger: 'postToolUse', toolName: 'fs_write' };

describe('validate - stop trigger', () => {
  it('exits 0 when no .weaver config', () => {
    mockReadProjectConfig.mockReturnValue(null);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it('exits 0 when no validation.stop hooks', () => {
    mockReadProjectConfig.mockReturnValue({ validation: {} });
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it('runs all hooks and collects results', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [
        { name: 'typecheck', command: 'npx tsc --noEmit' },
        { name: 'lint', command: 'npx eslint .' },
      ] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/src/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(result.exitCode).toBe(0);
  });

  it('substitutes {{files}} correctly', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'lint', command: 'eslint {{files}}' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts', '/project/b.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'eslint /project/a.ts /project/b.ts',
      expect.objectContaining({ shell: true }),
    );
  });

  it('substitutes {{test_dirs}} with scope-derived dirs', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'test', command: 'jest {{test_dirs}}', scope: 'parent' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/src/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockResolveTestDirs.mockReturnValue(['src']);
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(mockResolveTestDirs).toHaveBeenCalledWith(['/project/src/a.ts'], 'parent', '/project', []);
    expect(mockSpawnSync).toHaveBeenCalledWith('jest src', expect.objectContaining({ shell: true }));
  });

  it('run_if_files_match filters correctly', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'lint', command: 'eslint {{files}}', run_if_files_match: '**/*.{ts,tsx}' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/readme.md']);
    mockExtractAgentTestedDirs.mockReturnValue([]);

    runValidation(stopArgs);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('skips command when {{files}} is empty', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'lint', command: 'eslint {{files}}' }] },
    });
    mockExtractChangedFiles.mockReturnValue([]);
    mockExtractAgentTestedDirs.mockReturnValue([]);

    runValidation(stopArgs);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('skips command when {{test_dirs}} empty after agent dedup (with skipped_reason)', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'test', command: 'jest {{test_dirs}}', scope: 'parent' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/src/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue(['src']);
    mockResolveTestDirs.mockReturnValue([]);

    runValidation(stopArgs);
    expect(mockSpawnSync).not.toHaveBeenCalled();
    const appendCall = mockAppendFileSync.mock.calls[0];
    const event = JSON.parse(appendCall![1] as string);
    expect(event.results[0].skipped_reason).toBe('no test dirs after deduplication');
  });

  it('timeout kills process and marks timed_out', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'slow', command: 'sleep 999', timeout_ms: 100 }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult({ status: null, signal: 'SIGTERM', stdout: '', stderr: 'killed' }));

    runValidation(stopArgs);
    const appendCall = mockAppendFileSync.mock.calls[0];
    const event = JSON.parse(appendCall![1] as string);
    expect(event.results[0].timed_out).toBe(true);
    expect(event.results[0].passed).toBe(false);
  });

  it('output truncated at MAX_OUTPUT_LENGTH', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'verbose', command: 'echo lots' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult({ stdout: 'x'.repeat(10_000) }));

    runValidation(stopArgs);
    const appendCall = mockAppendFileSync.mock.calls[0];
    const event = JSON.parse(appendCall![1] as string);
    expect(event.results[0].output.length).toBe(5_000);
  });

  it('all pass → exit 0, no pending file', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'ok', command: 'echo ok' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult());

    const result = runValidation(stopArgs);
    expect(result.exitCode).toBe(0);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('some fail → exit 1, pending file written, STDERR summary', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [
        { name: 'typecheck', command: 'tsc' },
        { name: 'lint', command: 'eslint .' },
        { name: 'test', command: 'jest' },
      ] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync
      .mockReturnValueOnce(spawnResult({ status: 1, stderr: 'type error' }))
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(spawnResult({ status: 1, stderr: 'test fail' }));

    const result = runValidation(stopArgs);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('2/3 validations failed (typecheck, test)');
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('sess-1.pending'),
      expect.any(String),
    );
  });

  it('appends validation event to session log', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'check', command: 'echo ok' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(mockAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('sess-1.jsonl'),
      expect.stringContaining('"hook_event_name":"validation"'),
    );
  });

  it('notifies server after appending validation event', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { stop: [{ name: 'check', command: 'echo ok' }] },
    });
    mockExtractChangedFiles.mockReturnValue(['/project/a.ts']);
    mockExtractAgentTestedDirs.mockReturnValue([]);
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation(stopArgs);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8143/api/notify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'sess-1', eventName: 'validation' }),
      }),
    );
  });
});

describe('validate - postToolUse trigger', () => {
  it('exits 0 when no matching hooks', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { postToolUse: [{ matcher: 'execute_bash', name: 'fmt', command: 'echo' }] },
    });
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });

  it('matcher filters correctly', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { postToolUse: [
        { matcher: 'fs_write', name: 'format', command: 'prettier --write {{file}}' },
        { matcher: 'execute_bash', name: 'other', command: 'echo' },
      ] },
    });
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolInput: '{"path":"/project/src/a.ts"}' });
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'prettier --write /project/src/a.ts',
      expect.objectContaining({ shell: true }),
    );
  });

  it('substitutes {{file}} from tool_input.path', () => {
    mockReadProjectConfig.mockReturnValue({
      validation: { postToolUse: [{ matcher: 'fs_write', name: 'fmt', command: 'prettier {{file}}' }] },
    });
    mockSpawnSync.mockReturnValue(spawnResult());

    runValidation({ ...postToolArgs, toolInput: '{"path":"/project/x.ts"}' });
    expect(mockSpawnSync).toHaveBeenCalledWith('prettier /project/x.ts', expect.objectContaining({ shell: true }));
  });
});

describe('validate - no config', () => {
  it('exits 0 when no .weaver config for stop', () => {
    mockReadProjectConfig.mockReturnValue(null);
    expect(runValidation(stopArgs).exitCode).toBe(0);
  });

  it('exits 0 when no .weaver config for postToolUse', () => {
    mockReadProjectConfig.mockReturnValue(null);
    expect(runValidation(postToolArgs).exitCode).toBe(0);
  });
});
