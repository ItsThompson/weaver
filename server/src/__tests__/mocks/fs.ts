export function mockFsModules() {
  vi.mock("node:fs/promises", () => ({
    readFile: vi.fn<() => Promise<string>>(),
    writeFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    appendFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    mkdir: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readdir: vi.fn<() => Promise<string[]>>(),
    unlink: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }));

  vi.mock("node:fs", () => ({
    existsSync: vi.fn<() => boolean>(),
  }));
}
