import { stat } from 'node:fs/promises';

interface CacheEntry<T> {
  data: T;
  mtimeMs: number;
  size: number;
}

export class FileCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  async get(filePath: string, parser: () => Promise<T>): Promise<T> {
    let mtimeMs: number;
    let size: number;

    try {
      const s = await stat(filePath);
      mtimeMs = s.mtimeMs;
      size = s.size;
    } catch {
      this.cache.delete(filePath);
      return parser();
    }

    const entry = this.cache.get(filePath);
    if (entry && entry.mtimeMs === mtimeMs && entry.size === size) {
      return entry.data;
    }

    try {
      const data = await parser();
      this.cache.set(filePath, { data, mtimeMs, size });
      return data;
    } catch (err) {
      this.cache.delete(filePath);
      throw err;
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }
}
