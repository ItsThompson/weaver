import { stat } from 'node:fs/promises';

interface CacheEntry<T> {
  data: T;
  mtimeMs: number;
}

export class FileCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  async get(filePath: string, parser: () => Promise<T>): Promise<T> {
    try {
      const { mtimeMs } = await stat(filePath);
      const entry = this.cache.get(filePath);
      if (entry && entry.mtimeMs === mtimeMs) return entry.data;

      const data = await parser();
      this.cache.set(filePath, { data, mtimeMs });
      return data;
    } catch {
      this.cache.delete(filePath);
      return parser();
    }
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }
}
