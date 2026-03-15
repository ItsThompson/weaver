vi.mock("../../utils/api", () => ({
  apiFetch: vi.fn(),
  getSessions: vi.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getSession: vi.fn(),
  updateSessionName: vi.fn(),
  getOrphanCount: vi
    .fn<() => Promise<{ count: number }>>()
    .mockResolvedValue({ count: 0 }),
  getOrphans: vi.fn(),
  assignOrphans: vi.fn(),
  deleteOrphans: vi.fn(),
  deleteSession: vi.fn(),
  toggleSessionWebhook: vi.fn(),
  getConfig: vi
    .fn<() => Promise<{ config: object; warnings: string[] }>>()
    .mockResolvedValue({ config: {}, warnings: [] }),
  updateConfig: vi.fn(),
}));
