vi.mock("../../services/storage/index", () => ({
  readSessions: vi.fn(),
  writeSessions: vi.fn(),
  isProcessRunning: vi.fn(),
  ensureDataDir: vi.fn(),
  appendSession: vi.fn(),
  startStaleSessionCleanup: vi.fn(),
  stopStaleSessionCleanup: vi.fn(),
  cleanStaleSessions: vi.fn(),
}));

vi.mock("../../services/log-parser/index", async () => {
  const actual = await vi.importActual("../../services/log-parser/index");
  return {
    ...actual,
    parseLogFile: vi.fn(),
    getLastEvent: vi
      .fn<() => Promise<{ name: string; timestamp: string } | null>>()
      .mockResolvedValue({ name: "stop", timestamp: new Date().toISOString() }),
  };
});

vi.mock("../../services/orphan-storage/index", () => ({
  readOrphanEvents: vi.fn().mockResolvedValue([]),
  groupByPid: vi.fn().mockReturnValue([]),
  assignOrphanEvents: vi.fn().mockResolvedValue({ movedCount: 0 }),
  deleteOrphanEvents: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  NotFoundError: class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  },
}));

vi.mock("../../services/skill-resolver/index", () => ({
  skillNameFromPath: vi.fn((p: string) => p.split("/").at(-2) ?? p),
  resolveConfiguredSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/event-bus", () => ({
  broadcast: vi.fn(),
  emit: vi.fn(),
  sseReply: vi.fn(),
}));

vi.mock("../../services/webhook/index", () => ({
  handleWebhookEvent: vi.fn().mockResolvedValue(undefined),
  isWebhookEnabled: vi.fn().mockReturnValue(false),
  setWebhookEnabled: vi.fn(),
  stopWebhookTimers: vi.fn(),
}));

vi.mock("../../services/skill-graph/index", () => ({
  buildSkillGraph: vi.fn(),
  getSkillDetail: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  log: vi.fn(),
}));
