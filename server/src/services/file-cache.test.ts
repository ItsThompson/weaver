import { jest } from '@jest/globals';

jest.unstable_mockModule('node:fs/promises', () => ({
  stat: jest.fn<() => Promise<{ mtimeMs: number }>>(),
}));

const { stat } = await import('node:fs/promises');
const { FileCache } = await import('./file-cache.js');

const mockStat = stat as jest.MockedFunction<typeof stat>;

let cache: InstanceType<typeof FileCache<string[]>>;

beforeEach(() => {
  jest.clearAllMocks();
  cache = new FileCache<string[]>();
});

const parser = jest.fn<() => Promise<string[]>>();

describe('FileCache', () => {
  it('calls parser on cache miss and returns result', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    parser.mockResolvedValue(['a', 'b']);

    const result = await cache.get('/test.jsonl', parser);
    expect(result).toEqual(['a', 'b']);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('returns cached data when mtime is unchanged', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    parser.mockResolvedValue(['a']);

    await cache.get('/test.jsonl', parser);
    const result = await cache.get('/test.jsonl', parser);

    expect(result).toEqual(['a']);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('re-parses when mtime changes', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    parser.mockResolvedValue(['old']);
    await cache.get('/test.jsonl', parser);

    mockStat.mockResolvedValue({ mtimeMs: 2000 } as any);
    parser.mockResolvedValue(['new']);
    const result = await cache.get('/test.jsonl', parser);

    expect(result).toEqual(['new']);
    expect(parser).toHaveBeenCalledTimes(2);
  });

  it('invalidate() forces re-parse on next call', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    parser.mockResolvedValue(['first']);
    await cache.get('/test.jsonl', parser);

    cache.invalidate('/test.jsonl');
    parser.mockResolvedValue(['second']);
    const result = await cache.get('/test.jsonl', parser);

    expect(result).toEqual(['second']);
    expect(parser).toHaveBeenCalledTimes(2);
  });

  it('clear() removes all entries', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 } as any);
    parser.mockResolvedValue(['a']);
    await cache.get('/a.jsonl', parser);
    await cache.get('/b.jsonl', parser);

    cache.clear();
    parser.mockResolvedValue(['fresh']);
    const result = await cache.get('/a.jsonl', parser);

    expect(result).toEqual(['fresh']);
    expect(parser).toHaveBeenCalledTimes(3);
  });

  it('handles missing file gracefully', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    parser.mockResolvedValue([]);

    const result = await cache.get('/missing.jsonl', parser);
    expect(result).toEqual([]);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('does not cache result when stat fails', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    parser.mockResolvedValue(['fallback']);

    await cache.get('/missing.jsonl', parser);
    await cache.get('/missing.jsonl', parser);

    expect(parser).toHaveBeenCalledTimes(2);
  });
});
