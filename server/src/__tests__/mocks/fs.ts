import { jest } from "@jest/globals";

export function mockFsModules() {
  jest.unstable_mockModule("node:fs/promises", () => ({
    readFile: jest.fn<() => Promise<string>>(),
    writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    appendFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    mkdir: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readdir: jest.fn<() => Promise<string[]>>(),
    unlink: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }));

  jest.unstable_mockModule("node:fs", () => ({
    existsSync: jest.fn<() => boolean>(),
  }));
}
