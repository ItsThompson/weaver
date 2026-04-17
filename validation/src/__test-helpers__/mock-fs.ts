vi.mock("node:fs", () => ({
  existsSync: vi.fn<() => boolean>(),
  readFileSync: vi.fn<() => string>(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  realpathSync: vi.fn<(p: string) => string>(),
}));
