import { jest } from '@jest/globals';

jest.unstable_mockModule('node:child_process', () => ({
  execFileSync: jest.fn<() => string>(),
}));

jest.unstable_mockModule('@weaver/shared/db', () => {
  const mockDb = {
    listSessions: jest.fn().mockReturnValue([]),
    getSession: jest.fn(),
    updateSession: jest.fn(),
    close: jest.fn(),
  };
  return {
    WeaverDb: jest.fn().mockImplementation(() => mockDb),
    __mockDb: mockDb,
  };
});

jest.unstable_mockModule('../../utils/logger', () => ({
  log: jest.fn(),
}));

const cp = await import('node:child_process');
const dbModule = await import('@weaver/shared/db') as any;
const storage = await import('./storage');

const mockExecFileSync = cp.execFileSync as jest.MockedFunction<typeof cp.execFileSync>;
const mockDb = dbModule.__mockDb;

const { readSessions, isProcessRunning, cleanStaleSessions, getDb } = storage;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getDb', () => {
  it('returns a WeaverDb instance', () => {
    const db = getDb();
    expect(db).toBeDefined();
  });
});

describe('readSessions', () => {
  it('returns sessions mapped from SessionRow to Session', async () => {
    mockDb.listSessions.mockReturnValue([
      {
        id: 'aaa',
        agent_session_id: null,
        pid: 100,
        cwd: '/tmp',
        agent_name: null,
        custom_name: null,
        model: null,
        status: 'open',
        context_usage_percent: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:01:00Z',
      },
    ]);

    const sessions = await readSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      id: 'aaa',
      pid: 100,
      customName: null,
      cwd: '/tmp',
      agentName: null,
      startTime: '2026-01-01T00:00:00Z',
      lastEventTime: '2026-01-01T00:01:00Z',
    });
  });

  it('returns empty array when no sessions exist', async () => {
    mockDb.listSessions.mockReturnValue([]);
    const sessions = await readSessions();
    expect(sessions).toEqual([]);
  });

  it('defaults pid to 0 when null', async () => {
    mockDb.listSessions.mockReturnValue([
      { id: 'x', pid: null, cwd: '/tmp', agent_name: null, custom_name: null, created_at: 't1', updated_at: 't2' },
    ]);
    const sessions = await readSessions();
    expect(sessions[0].pid).toBe(0);
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

describe('cleanStaleSessions', () => {
  it('marks open sessions with dead PIDs as closed', async () => {
    mockDb.listSessions.mockReturnValue([
      { id: 'dead', pid: 999999, status: 'open', cwd: '/tmp' },
    ]);

    await cleanStaleSessions();
    expect(mockDb.updateSession).toHaveBeenCalledWith('dead', { status: 'closed' });
  });

  it('leaves open sessions with live PIDs untouched', async () => {
    mockExecFileSync.mockReturnValue(`/path/to/kiro-cli chat\n`);
    mockDb.listSessions.mockReturnValue([
      { id: 'live', pid: process.pid, status: 'open', cwd: '/tmp' },
    ]);

    await cleanStaleSessions();
    expect(mockDb.updateSession).not.toHaveBeenCalled();
  });

  it('ignores already-closed sessions', async () => {
    mockDb.listSessions.mockReturnValue([
      { id: 'closed', pid: 999999, status: 'closed', cwd: '/tmp' },
    ]);

    await cleanStaleSessions();
    expect(mockDb.updateSession).not.toHaveBeenCalled();
  });
});
