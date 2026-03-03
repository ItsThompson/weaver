import { jest } from '@jest/globals';

// Mock fs modules before importing storage
jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readFile: jest.fn<() => Promise<string>>(),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  readdir: jest.fn<() => Promise<string[]>>(),
  unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn<() => boolean>(),
}));

jest.unstable_mockModule('node:child_process', () => ({
  execFileSync: jest.fn<() => string>(),
}));

// Silence logger in tests
jest.unstable_mockModule('../utils/logger.js', () => ({
  log: jest.fn(),
}));

// Dynamic imports must come after all jest.unstable_mockModule calls
const fsp = await import('node:fs/promises');
const fs = await import('node:fs');
const cp = await import('node:child_process');
const storage = await import('../services/storage.js');

const { mkdir, readFile, appendFile, readdir, unlink } = fsp;
const { existsSync } = fs;
const { ensureDataDir, readSessions, appendSession, cleanStaleSessions, isProcessRunning } = storage;

const mockMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockAppendFile = appendFile as jest.MockedFunction<typeof appendFile>;
const mockReaddir = readdir as jest.MockedFunction<typeof readdir>;
const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockExecFileSync = cp.execFileSync as jest.MockedFunction<typeof cp.execFileSync>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureDataDir', () => {
  it('creates data and logs directories', async () => {
    await ensureDataDir();
    expect(mockMkdir).toHaveBeenCalledTimes(2);
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.weaver'), { recursive: true });
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
  });

  it('throws when directory creation fails', async () => {
    mockMkdir.mockRejectedValueOnce(new Error('permission denied'));
    await expect(ensureDataDir()).rejects.toThrow('permission denied');
  });
});

describe('readSessions', () => {
  it('returns empty array when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const sessions = await readSessions();
    expect(sessions).toEqual([]);
  });

  it('parses JSONL into Session array', async () => {
    mockExistsSync.mockReturnValue(true);
    const line1 = JSON.stringify({ id: 'a', pid: 1, customName: null, cwd: '/tmp', agentName: null, startTime: 't1', lastEventTime: 't1' });
    const line2 = JSON.stringify({ id: 'b', pid: 2, customName: 'test', cwd: '/home', agentName: 'dev', startTime: 't2', lastEventTime: 't2' });
    mockReadFile.mockResolvedValue(`${line1}\n${line2}\n`);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe('a');
    expect(sessions[1].id).toBe('b');
  });

  it('skips malformed lines gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    const valid = JSON.stringify({ id: 'a', pid: 1, customName: null, cwd: '/tmp', agentName: null, startTime: 't1', lastEventTime: 't1' });
    mockReadFile.mockResolvedValue(`${valid}\n{bad json\n`);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('a');
  });
});

describe('appendSession', () => {
  it('appends JSON line to sessions file', async () => {
    const session = { id: 'a', pid: 1, customName: null, cwd: '/tmp', agentName: null, startTime: 't1', lastEventTime: 't1' };
    await appendSession(session);
    expect(mockAppendFile).toHaveBeenCalledWith(
      expect.stringContaining('sessions.jsonl'),
      JSON.stringify(session) + '\n',
      'utf-8',
    );
  });
});

describe('cleanStaleSessions', () => {
  it('deletes marker files for dead PIDs', async () => {
    // Use a PID that is almost certainly not running
    const deadPid = 999999;
    mockReaddir.mockResolvedValue([`.current-session-${deadPid}`] as any);

    await cleanStaleSessions();
    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining(`.current-session-${deadPid}`));
  });

  it('leaves marker files for live PIDs', async () => {
    // Use current process PID which is guaranteed to be running and signalable
    const livePid = process.pid;
    mockReaddir.mockResolvedValue([`.current-session-${livePid}`] as any);
    mockExecFileSync.mockReturnValue(`/path/to/kiro-cli chat\n`);

    await cleanStaleSessions();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('skips files with non-numeric PID suffixes', async () => {
    mockReaddir.mockResolvedValue(['.current-session-abc'] as any);

    await cleanStaleSessions();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('handles readdir failure gracefully', async () => {
    mockReaddir.mockRejectedValue(new Error('no such directory'));

    await expect(cleanStaleSessions()).resolves.toBeUndefined();
  });
});

describe('isProcessRunning', () => {
  it('returns true for a running kiro-cli process', () => {
    mockExecFileSync.mockReturnValue(`/path/to/kiro-cli chat --agent dev\n`);
    expect(isProcessRunning(process.pid)).toBe(true);
  });

  it('returns false for a non-existent process', () => {
    expect(isProcessRunning(999999)).toBe(false);
  });

  it('returns false when PID is alive but not kiro-cli (PID reuse)', () => {
    mockExecFileSync.mockReturnValue(`/usr/bin/some-other-process\n`);
    expect(isProcessRunning(process.pid)).toBe(false);
  });
});
