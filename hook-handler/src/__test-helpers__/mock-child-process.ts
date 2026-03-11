import { jest } from "@jest/globals";
import type { SpawnSyncReturns } from "node:child_process";

export async function mockChildProcess() {
  jest.unstable_mockModule("node:child_process", () => ({
    spawnSync: jest.fn<() => Partial<SpawnSyncReturns<string>>>(),
  }));

  const childProcess = await import("node:child_process");
  return {
    spawnSync: childProcess.spawnSync as jest.MockedFunction<
      typeof childProcess.spawnSync
    >,
  };
}
