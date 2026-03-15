vi.mock("../../config/index", () => ({
  readProjectConfig: vi.fn(),
  resolveTestRunners: vi.fn<() => string[]>(),
  findNearestConfig: vi.fn(),
  groupFilesByConfig: vi.fn(),
}));

vi.mock("../../changed-files/index", () => ({
  extractChangedFiles: vi.fn<() => string[]>(),
}));

vi.mock("../../agent-tests/index", () => ({
  extractAgentTestedDirs: vi.fn<() => string[]>(),
}));

vi.mock("../../scope/index", () => ({
  resolveTestDirs: vi.fn<() => string[]>(),
}));
