import { jest } from "@jest/globals";

export async function mockFs() {
  const realpathSyncMock = jest.fn<(p: string) => string>();

  jest.unstable_mockModule("node:fs", () => ({
    existsSync: jest.fn<() => boolean>(),
    readFileSync: jest.fn<() => string>(),
    writeFileSync: jest.fn(),
    appendFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(),
    realpathSync: realpathSyncMock,
  }));

  const fs = await import("node:fs");
  return {
    existsSync: fs.existsSync as jest.MockedFunction<typeof fs.existsSync>,
    readFileSync: fs.readFileSync as jest.MockedFunction<
      typeof fs.readFileSync
    >,
    writeFileSync: fs.writeFileSync as jest.MockedFunction<
      typeof fs.writeFileSync
    >,
    appendFileSync: fs.appendFileSync as jest.MockedFunction<
      typeof fs.appendFileSync
    >,
    mkdirSync: fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>,
    unlinkSync: fs.unlinkSync as jest.MockedFunction<typeof fs.unlinkSync>,
    realpathSync: realpathSyncMock,
  };
}
