import type { SpawnSyncReturns } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn<() => Partial<SpawnSyncReturns<string>>>(),
}));
