export function mockServices() {
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

  vi.mock("../../services/log-parser/index", () => ({
    parseLogFile: vi.fn(),
    groupEventsByTurn: vi.fn(),
    getLastEvent: vi
      .fn<() => Promise<{ name: string; timestamp: string } | null>>()
      .mockResolvedValue({ name: "stop", timestamp: new Date().toISOString() }),
    deriveActivity: vi.fn().mockReturnValue("idle"),
  }));

  vi.mock("../../services/event-bus", () => ({
    broadcast: vi.fn(),
    emit: vi.fn(),
    sseReply: vi.fn(),
  }));

  vi.mock("../../services/webhook/index", () => ({
    handleWebhookEvent: vi.fn(),
    isWebhookEnabled: vi.fn().mockReturnValue(false),
    setWebhookEnabled: vi.fn(),
    stopWebhookTimers: vi.fn(),
  }));

  vi.mock("../../utils/logger", () => ({
    log: vi.fn(),
  }));
}
