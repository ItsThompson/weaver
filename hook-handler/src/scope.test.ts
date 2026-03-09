import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('node:fs', () => ({
  realpathSync: jest.fn<(p: string) => string>(),
  readFileSync: jest.fn<() => string>(),
  existsSync: jest.fn<() => boolean>(),
}));

const fs = await import('node:fs');
const { resolveTestDirs } = await import('./scope.js');

const mockRealpathSync = fs.realpathSync as unknown as jest.MockedFunction<(p: string) => string>;

const CWD = '/project';

beforeEach(() => {
  jest.clearAllMocks();
  mockRealpathSync.mockImplementation((p: string) => String(p));
});

describe('resolveTestDirs', () => {
  it('scope "file" / 0 returns file parent directory', () => {
    const result = resolveTestDirs(['/project/src/features/auth/login/LoginForm.tsx'], 'file', CWD, []);
    expect(result).toEqual(['src/features/auth/login']);
  });

  it('scope 0 returns file parent directory', () => {
    const result = resolveTestDirs(['/project/src/a/b.ts'], 0, CWD, []);
    expect(result).toEqual(['src/a']);
  });

  it('scope "parent" / 1 returns one level up', () => {
    const result = resolveTestDirs(['/project/src/features/auth/login/LoginForm.tsx'], 'parent', CWD, []);
    expect(result).toEqual(['src/features/auth']);
  });

  it('scope 2 returns two levels up', () => {
    const result = resolveTestDirs(['/project/src/features/auth/login/LoginForm.tsx'], 2, CWD, []);
    expect(result).toEqual(['src/features']);
  });

  it('scope "cwd" always returns ["."]', () => {
    const result = resolveTestDirs(['/project/src/deep/file.ts'], 'cwd', CWD, []);
    expect(result).toEqual(['.']);
  });

  it('no scope defaults to ["."]', () => {
    const result = resolveTestDirs(['/project/src/file.ts'], undefined, CWD, []);
    expect(result).toEqual(['.']);
  });

  it('clamps to "." when scope depth exceeds CWD', () => {
    const result = resolveTestDirs(['/project/src/file.ts'], 5, CWD, []);
    expect(result).toEqual(['.']);
  });

  it('clamps to "." when file at CWD root with scope "parent"', () => {
    const result = resolveTestDirs(['/project/file.ts'], 'parent', CWD, []);
    expect(result).toEqual(['.']);
  });

  it('resolves symlink inside CWD normally', () => {
    mockRealpathSync.mockImplementation((p: string) =>
      String(p).replace('linked', 'real'),
    );
    const result = resolveTestDirs(['/project/src/linked/file.ts'], 'file', CWD, []);
    expect(result).toEqual(['src/real']);
  });

  it('clamps to "." when symlink resolves outside CWD', () => {
    mockRealpathSync.mockImplementation(() => '/outside/project/file.ts');
    const result = resolveTestDirs(['/project/src/link.ts'], 'file', CWD, []);
    expect(result).toEqual(['.']);
  });

  it('deduplicates two files in same directory', () => {
    const result = resolveTestDirs(
      ['/project/src/a/one.ts', '/project/src/a/two.ts'],
      'file', CWD, [],
    );
    expect(result).toEqual(['src/a']);
  });

  it('collapses child when parent already present', () => {
    const result = resolveTestDirs(
      ['/project/src/a/b/deep.ts', '/project/src/a/shallow.ts'],
      'file', CWD, [],
    );
    expect(result).toEqual(['src/a']);
  });

  it('skips dir when agent tested parent', () => {
    const result = resolveTestDirs(
      ['/project/src/features/auth/login/LoginForm.tsx'],
      'file', CWD, ['src/features/auth'],
    );
    expect(result).toEqual([]);
  });

  it('keeps dir when agent only tested child', () => {
    const result = resolveTestDirs(
      ['/project/src/features/auth/login/LoginForm.tsx'],
      'parent', CWD, ['src/features/auth/login/sub'],
    );
    expect(result).toEqual(['src/features/auth']);
  });

  it('skips dir on exact agent-test match', () => {
    const result = resolveTestDirs(
      ['/project/src/features/auth/login/LoginForm.tsx'],
      'file', CWD, ['src/features/auth/login'],
    );
    expect(result).toEqual([]);
  });

  it('returns paths relative to CWD', () => {
    const result = resolveTestDirs(
      ['/project/src/a/b/c.ts'], 1, CWD, [],
    );
    expect(result).toEqual(['src/a']);
    expect(result.every((p) => !p.startsWith('/'))).toBe(true);
  });
});
