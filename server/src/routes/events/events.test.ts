import { SESSION_A } from "../../__tests__/fixtures/sessions";

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

import { readSessions } from "../../services/storage/index";
import { broadcast, emit, sseReply } from "../../services/event-bus";
import { handleWebhookEvent } from "../../services/webhook/index";
import Fastify from "fastify";
import { registerEventRoutes } from "./events";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerEventRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("POST /api/notify", () => {
  it("broadcasts with enriched session name", async () => {
    vi.mocked(readSessions).mockResolvedValue([
      { ...SESSION_A, customName: "My App" },
    ]);

    const res = await server.inject({
      method: "POST",
      url: "/api/notify",
      payload: { sessionId: "aaa", eventName: "userPromptSubmit" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(broadcast)).toHaveBeenCalledWith(
      "aaa",
      "userPromptSubmit",
      "My App",
    );
    expect(vi.mocked(handleWebhookEvent)).toHaveBeenCalled();
  });

  it("returns 400 when sessionId missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/notify",
      payload: { eventName: "stop" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/view", () => {
  it("resolves PID to session and emits navigate", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);

    const res = await server.inject({
      method: "POST",
      url: "/api/view",
      payload: { pid: 100 },
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.sessionId).toBe("aaa");
    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "navigate",
      data: { sessionId: "aaa" },
    });
  });

  it("returns 404 when PID not found", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "POST",
      url: "/api/view",
      payload: { pid: 999 },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/navigate", () => {
  it("emits navigate event with page", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/navigate",
      payload: { page: "sessions" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "navigate",
      data: { page: "sessions" },
    });
  });
});

describe("GET /api/events", () => {
  it("delegates to sseReply", async () => {
    await server.inject({ method: "GET", url: "/api/events" });
    expect(vi.mocked(sseReply)).toHaveBeenCalled();
  });
});
