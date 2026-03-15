vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/user"),
}));
