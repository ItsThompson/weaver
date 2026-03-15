vi.mock("node:child_process", () => ({
  execFileSync: vi.fn<() => string>(),
}));
