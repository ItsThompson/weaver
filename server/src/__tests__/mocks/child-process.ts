vi.mock("node:child_process", () => ({
  execFile: vi.fn<() => void>(),
}));
