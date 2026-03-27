vi.mock("../../config/index", () => ({
  readProjectConfig: vi.fn(),
  resolveTestRunners: vi.fn<() => string[]>(),
  findNearestConfig: vi.fn(),
  groupFilesByConfig: vi.fn(),
}));

vi.mock("../../session-analysis", () => ({
  extractChangedFiles: vi.fn<() => string[]>(),
  extractAgentTestedDirs: vi.fn<() => string[]>(),
  isWithinDir: vi.fn<() => boolean>(),
}));

vi.mock("../../scope/index", () => ({
  resolveTestDirs: vi.fn<() => string[]>(),
}));
