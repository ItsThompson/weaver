vi.mock("../../utils/api", () => ({
  apiFetch: vi.fn(),
  ApiResponseError: class ApiResponseError extends Error {
    fieldErrors?: Record<string, Record<string, string>>;
    constructor(
      message: string,
      fieldErrors?: Record<string, Record<string, string>>,
    ) {
      super(message);
      this.name = "ApiResponseError";
      this.fieldErrors = fieldErrors;
    }
  },
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
    .fn<
      () => Promise<{
        config: object;
        warnings: string[];
        fieldErrors: Record<string, Record<string, string>>;
      }>
    >()
    .mockResolvedValue({ config: {}, warnings: [], fieldErrors: {} }),
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
    project: null,
  }),
}));
