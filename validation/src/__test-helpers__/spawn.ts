import type { SpawnSyncReturns } from "node:child_process";

export function spawnResult(
  overrides: Partial<SpawnSyncReturns<string>> = {},
): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  } as SpawnSyncReturns<string>;
}
