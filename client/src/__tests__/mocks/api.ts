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
  patchConfig: vi.fn(),
  getSkillGraph: vi
    .fn<() => Promise<any>>()
    .mockResolvedValue({ nodes: [], edges: [] }),
  getSkillDetail: vi.fn<() => Promise<any>>().mockResolvedValue({
    frontmatter: {},
    body: "",
    source: "global",
    category: null,
  }),
  getSnippets: vi.fn<() => Promise<any>>().mockResolvedValue({ snippets: [] }),
  createSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippetApi: vi.fn(),
  getServicesStatus: vi.fn<() => Promise<any>>().mockResolvedValue({
    ready: true,
    services: {
      whisper: { state: "not_configured" },
      ollama: { state: "not_configured" },
    },
  }),
  transcribeAudio: vi.fn(),
  processTranscript: vi.fn(),
  getModels: vi
    .fn<() => Promise<any>>()
    .mockResolvedValue({ available: [], local: [] }),
  getDictationHistory: vi
    .fn<() => Promise<any>>()
    .mockResolvedValue({ entries: [] }),
}));
