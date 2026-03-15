import { SESSION_A, SESSION_B } from "../../__tests__/fixtures/sessions";

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

import {
  readSessions,
  writeSessions,
  isProcessRunning,
} from "../../services/storage/index";
import {
  parseLogFile,
  groupEventsByTurn,
} from "../../services/log-parser/index";
import { broadcast } from "../../services/event-bus";
import Fastify from "fastify";
import { registerSessionRoutes } from "./sessions";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerSessionRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("GET /api/sessions", () => {
  it("returns sessions with status", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A, SESSION_B]);
    vi.mocked(isProcessRunning).mockReturnValue(false);

    const res = await server.inject({ method: "GET", url: "/api/sessions" });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe("closed");
  });

  it("marks session as open when process is running", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockReturnValue(true);

    const res = await server.inject({ method: "GET", url: "/api/sessions" });
    const body = JSON.parse(res.body);

    expect(body[0].status).toBe("open");
  });
});

describe("GET /api/sessions/:id", () => {
  it("returns session detail with turns", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A]);
    vi.mocked(isProcessRunning).mockReturnValue(true);
    vi.mocked(parseLogFile).mockResolvedValue([]);
    vi.mocked(groupEventsByTurn).mockReturnValue([]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/aaa",
    });
    const body = JSON.parse(res.body);

    expect(res.statusCode).toBe(200);
    expect(body.session.id).toBe("aaa");
    expect(body.turns).toEqual([]);
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "GET",
      url: "/api/sessions/unknown",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /api/sessions/:id", () => {
  it("updates session name", async () => {
    vi.mocked(readSessions).mockResolvedValue([{ ...SESSION_A }]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);

    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/aaa",
      payload: { customName: "New Name" },
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(writeSessions)).toHaveBeenCalled();
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "PATCH",
      url: "/api/sessions/unknown",
      payload: { customName: "x" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/sessions/:id", () => {
  it("removes session and broadcasts", async () => {
    vi.mocked(readSessions).mockResolvedValue([SESSION_A, SESSION_B]);
    vi.mocked(writeSessions).mockResolvedValue(undefined);

    const res = await server.inject({
      method: "DELETE",
      url: "/api/sessions/aaa",
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(writeSessions)).toHaveBeenCalledWith([SESSION_B]);
    expect(vi.mocked(broadcast)).toHaveBeenCalledWith("aaa");
  });

  it("returns 404 for unknown session", async () => {
    vi.mocked(readSessions).mockResolvedValue([]);

    const res = await server.inject({
      method: "DELETE",
      url: "/api/sessions/unknown",
    });

    expect(res.statusCode).toBe(404);
  });
});
