import type { Stats } from "node:fs";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn<() => Promise<Stats>>(),
  readFile: vi.fn<() => Promise<string>>(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
}));

import { stat } from "node:fs/promises";
import { FileCache } from "./file-cache";

function fakeStat(mtimeMs: number, size: number) {
  return { mtimeMs, size } as Stats;
}

let cache: InstanceType<typeof FileCache<string[]>>;

beforeEach(() => {
  vi.clearAllMocks();
  cache = new FileCache<string[]>();
});

const parser = vi.fn<() => Promise<string[]>>();

describe("FileCache", () => {
  it("calls parser on cache miss and returns result", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["a", "b"]);

    const result = await cache.get("/test.jsonl", parser);
    expect(result).toEqual(["a", "b"]);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it("returns cached data when mtime and size are unchanged", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["a"]);

    await cache.get("/test.jsonl", parser);
    const result = await cache.get("/test.jsonl", parser);

    expect(result).toEqual(["a"]);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it("re-parses when mtime changes", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["old"]);
    await cache.get("/test.jsonl", parser);

    vi.mocked(stat).mockResolvedValue(fakeStat(2000, 50));
    parser.mockResolvedValue(["new"]);
    const result = await cache.get("/test.jsonl", parser);

    expect(result).toEqual(["new"]);
    expect(parser).toHaveBeenCalledTimes(2);
  });

  it("re-parses when size changes even if mtime is the same", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["old"]);
    await cache.get("/test.jsonl", parser);

    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 80));
    parser.mockResolvedValue(["new"]);
    const result = await cache.get("/test.jsonl", parser);

    expect(result).toEqual(["new"]);
    expect(parser).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces re-parse on next call", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["first"]);
    await cache.get("/test.jsonl", parser);

    cache.invalidate("/test.jsonl");
    parser.mockResolvedValue(["second"]);
    const result = await cache.get("/test.jsonl", parser);

    expect(result).toEqual(["second"]);
    expect(parser).toHaveBeenCalledTimes(2);
  });

  it("clear() removes all entries", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["a"]);
    await cache.get("/a.jsonl", parser);
    await cache.get("/b.jsonl", parser);

    cache.clear();
    parser.mockResolvedValue(["fresh"]);
    const result = await cache.get("/a.jsonl", parser);

    expect(result).toEqual(["fresh"]);
    expect(parser).toHaveBeenCalledTimes(3);
  });

  it("handles missing file gracefully", async () => {
    vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));
    parser.mockResolvedValue([]);

    const result = await cache.get("/missing.jsonl", parser);
    expect(result).toEqual([]);
    expect(parser).toHaveBeenCalledTimes(1);
  });

  it("does not cache result when stat fails", async () => {
    vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));
    parser.mockResolvedValue(["fallback"]);

    await cache.get("/missing.jsonl", parser);
    await cache.get("/missing.jsonl", parser);

    expect(parser).toHaveBeenCalledTimes(2);
  });

  it("clears cache and re-throws when parser fails", async () => {
    vi.mocked(stat).mockResolvedValue(fakeStat(1000, 50));
    parser.mockResolvedValue(["cached"]);
    await cache.get("/test.jsonl", parser);

    vi.mocked(stat).mockResolvedValue(fakeStat(2000, 80));
    parser.mockRejectedValue(new Error("read failed"));

    await expect(cache.get("/test.jsonl", parser)).rejects.toThrow(
      "read failed",
    );

    // Cache entry should be cleared — next call re-parses
    parser.mockResolvedValue(["recovered"]);
    const result = await cache.get("/test.jsonl", parser);
    expect(result).toEqual(["recovered"]);
    expect(parser).toHaveBeenCalledTimes(3);
  });
});
