import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
  unlinkSync: jest.fn(),
}));

const fs = await import('node:fs');

const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockUnlinkSync = fs.unlinkSync as jest.MockedFunction<typeof fs.unlinkSync>;

// Mock process.exit before importing the module (it has top-level CLI code)
const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
const { runInject } = await import('./inject');
mockExit.mockRestore();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runInject', () => {
  it('exits 0 with no output when pending file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = runInject('sess-1');
    expect(result).toEqual({ stdout: '', exitCode: 0 });
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('reads pending file, formats output, deletes file, exits 0', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [
        { name: 'typecheck', passed: false, output: 'error TS2345: bad type', duration_ms: 2300, timed_out: false },
        { name: 'lint', passed: true, output: '', duration_ms: 1100, timed_out: false },
      ],
    }));

    const result = runInject('sess-1');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[Weaver Validation — Previous Turn]');
    expect(result.stdout).toContain('✗ typecheck (2.3s)');
    expect(result.stdout).toContain('  error TS2345: bad type');
    expect(result.stdout).toContain('✓ lint (1.1s)');
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it('deletes malformed pending file and exits 0 with no output', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json{{{');

    const result = runInject('sess-1');
    expect(result).toEqual({ stdout: '', exitCode: 0 });
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  it('shows skipped results with ⊘ marker', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [
        { name: 'test:server', passed: true, output: '', duration_ms: 0, timed_out: false, skipped_reason: 'already tested by agent' },
      ],
    }));

    const result = runInject('sess-1');
    expect(result.stdout).toContain('⊘ test:server — skipped (already tested by agent)');
  });

  it('shows passed results with ✓ marker', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [
        { name: 'lint', passed: true, output: '', duration_ms: 500, timed_out: false },
      ],
    }));

    const result = runInject('sess-1');
    expect(result.stdout).toContain('✓ lint (0.5s)');
  });

  it('shows failed results with ✗ marker and includes output', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [
        { name: 'typecheck', passed: false, output: 'line1\nline2', duration_ms: 3000, timed_out: false },
      ],
    }));

    const result = runInject('sess-1');
    expect(result.stdout).toContain('✗ typecheck (3.0s)');
    expect(result.stdout).toContain('  line1\n  line2');
  });

  it('shows timed_out indicator on failed results', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      results: [
        { name: 'slow', passed: false, output: '', duration_ms: 30000, timed_out: true },
      ],
    }));

    const result = runInject('sess-1');
    expect(result.stdout).toContain('✗ slow (30.0s, timed out)');
  });

  it('exits 0 with no output when session-id is empty', () => {
    const result = runInject('');
    expect(result).toEqual({ stdout: '', exitCode: 0 });
  });
});
